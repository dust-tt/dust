/**
 * Debug a single user's AWU "Consumed" figure against the live Metronome seat
 * balance and the raw per-hour usage, so we can reconcile discrepancies (e.g.
 * "Consumed 6113 but seat shows 1772/8000") and check whether the contract
 * starts on the hour.
 *
 * Read-only: ignores --execute. Dumps:
 *   - contract.starting_at and the current billing period bounds
 *   - the user's live seat AWU balance (balance + starting_balance)
 *   - per-hour usage buckets for the user (cost_awu + tool invocations), split
 *     by usage_type, flagging buckets trimmed because they precede the period
 *     start, and weighting tool invocations into AWU
 *   - the canonical Consumed from fetchPerUserAwuUsage, and the comparison with
 *     the seat ledger (starting_balance - balance)
 *
 *   npx tsx scripts/debug_user_awu_spend.ts --workspaceId <wId> --userId <uId>
 */
import {
  ceilToMidnightUTC,
  floorToMidnightUTC,
  listMetronomeSeatBalances,
  listMetronomeUsageWithGroups,
} from "@app/lib/metronome/client";
import {
  getCreditTypeAwuId,
  getMetricLlmProviderCostAwuId,
  getMetricToolInvocationsId,
  USAGE_TYPE_GROUP_KEY,
  USAGE_TYPE_PROGRAMMATIC,
  USAGE_TYPE_USER,
} from "@app/lib/metronome/constants";
import { getMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import {
  isToolCategory,
  TOOL_CATEGORY_AWU_WEIGHTS,
} from "@app/lib/metronome/events";
import { fetchPerUserAwuUsage } from "@app/lib/metronome/per_user_usage";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";

import { makeScript } from "./helpers";

makeScript(
  {
    workspaceId: { alias: "w", type: "string" as const, demandOption: true },
    userId: { alias: "u", type: "string" as const, demandOption: true },
  },
  async ({ workspaceId, userId }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      logger.error({ workspaceId }, "Workspace not found");
      return;
    }
    const { metronomeCustomerId } = workspace;
    if (!metronomeCustomerId) {
      logger.error({ workspaceId }, "Workspace has no metronomeCustomerId");
      return;
    }

    const contract = await getActiveContract(workspace.sId);
    if (!contract?.id) {
      logger.error({ workspaceId }, "No active contract");
      return;
    }
    const metronomeContractId = contract.id;
    const contractStart = new Date(contract.starting_at);
    logger.info(
      {
        workspaceId,
        userId,
        contractStartingAt: contract.starting_at,
        contractStartMs: contractStart.getTime(),
        onTheHour:
          contractStart.getUTCMinutes() === 0 &&
          contractStart.getUTCSeconds() === 0,
      },
      "[debug] Contract start"
    );

    const periodResult = await getMetronomeCurrentBillingPeriod({
      metronomeCustomerId,
      metronomeContractId,
    });
    if (periodResult.isErr() || !periodResult.value) {
      logger.error({ workspaceId }, "No current billing period");
      return;
    }
    const { cycleStart, cycleEnd } = periodResult.value;
    const cycleStartMs = cycleStart.getTime();
    logger.info(
      {
        cycleStart: cycleStart.toISOString(),
        cycleEnd: cycleEnd.toISOString(),
        startNotMidnight:
          cycleStartMs !== floorToMidnightUTC(cycleStart).getTime(),
      },
      "[debug] Billing period (used by Consumed)"
    );

    // --- Seat ledger -------------------------------------------------------
    const awuCreditTypeId = getCreditTypeAwuId();
    const seatBalancesResult = await listMetronomeSeatBalances({
      metronomeCustomerId,
      metronomeContractId,
    });
    if (seatBalancesResult.isErr()) {
      logger.error(
        { err: seatBalancesResult.error },
        "Failed to read seat balances"
      );
      return;
    }
    const seat = seatBalancesResult.value.find((b) => b.seat_id === userId);
    const awu = seat?.balances.find(
      (b) => b.credit_type_id === awuCreditTypeId
    );
    const seatStarting = awu?.starting_balance ?? null;
    const seatBalance = awu?.balance ?? null;
    const seatConsumed =
      seatStarting !== null && seatBalance !== null
        ? seatStarting - seatBalance
        : null;
    logger.info(
      {
        seatStartingBalanceAwu: seatStarting,
        seatBalanceAwu: seatBalance,
        seatLedgerConsumedAwu: seatConsumed,
      },
      "[debug] Seat ledger (live)"
    );

    // --- Raw per-hour usage for this user (all usage types) ----------------
    const startingOn = floorToMidnightUTC(cycleStart).toISOString();
    const endingBefore = ceilToMidnightUTC(
      new Date(Math.min(cycleEnd.getTime(), Date.now()))
    ).toISOString();

    const [aiResult, toolResult] = await Promise.all([
      listMetronomeUsageWithGroups({
        customerId: metronomeCustomerId,
        billableMetricId: getMetricLlmProviderCostAwuId(),
        startingOn,
        endingBefore,
        windowSize: "HOUR",
        groupKey: ["user_id", USAGE_TYPE_GROUP_KEY],
        groupFilters: { user_id: [userId] },
      }),
      listMetronomeUsageWithGroups({
        customerId: metronomeCustomerId,
        billableMetricId: getMetricToolInvocationsId(),
        startingOn,
        endingBefore,
        windowSize: "HOUR",
        groupKey: ["user_id", USAGE_TYPE_GROUP_KEY, "tool_category"],
        groupFilters: { user_id: [userId] },
      }),
    ]);
    if (aiResult.isErr() || toolResult.isErr()) {
      logger.error(
        {
          aiErr: aiResult.isErr() ? aiResult.error : null,
          toolErr: toolResult.isErr() ? toolResult.error : null,
        },
        "Failed to read usage"
      );
      return;
    }

    // Per-hour breakdown. trimmed = bucket starts before the period start (the
    // pre-contract span that Consumed drops).
    let llmPaid = 0;
    let llmFree = 0;
    let llmTrimmed = 0;
    for (const e of aiResult.value) {
      if (e.value === null) {
        continue;
      }
      const tsMs = new Date(e.startingOn).getTime();
      const usageType = e.group?.[USAGE_TYPE_GROUP_KEY] ?? "?";
      const trimmed = tsMs < cycleStartMs;
      if (trimmed) {
        llmTrimmed += e.value;
      } else if (usageType === "free") {
        llmFree += e.value;
      } else {
        llmPaid += e.value;
      }
      if (e.value !== 0) {
        logger.info(
          { startingOn: e.startingOn, usageType, costAwu: e.value, trimmed },
          "[debug] LLM hourly bucket"
        );
      }
    }

    let toolPaid = 0;
    let toolFree = 0;
    let toolTrimmed = 0;
    for (const e of toolResult.value) {
      const category = e.group?.["tool_category"];
      if (e.value === null || !category || !isToolCategory(category)) {
        continue;
      }
      const awuSpent = e.value * TOOL_CATEGORY_AWU_WEIGHTS[category];
      const tsMs = new Date(e.startingOn).getTime();
      const usageType = e.group?.[USAGE_TYPE_GROUP_KEY] ?? "?";
      const trimmed = tsMs < cycleStartMs;
      if (trimmed) {
        toolTrimmed += awuSpent;
      } else if (usageType === "free") {
        toolFree += awuSpent;
      } else {
        toolPaid += awuSpent;
      }
      if (awuSpent !== 0) {
        logger.info(
          {
            startingOn: e.startingOn,
            usageType,
            category,
            count: e.value,
            awu: awuSpent,
            trimmed,
          },
          "[debug] Tool hourly bucket"
        );
      }
    }

    // --- Canonical query replica -------------------------------------------
    // Reproduce fetchPerUserAwuUsage's EXACT queries (usage_type filter, no
    // user_id filter; same windowSize logic) and sum for THIS user, to see
    // whether the usage_type filter — not the window — drops usage.
    const windowSizeUsed =
      cycleStartMs === floorToMidnightUTC(cycleStart).getTime()
        ? "DAY"
        : "HOUR";
    const paidUsageTypes = [USAGE_TYPE_USER, USAGE_TYPE_PROGRAMMATIC];
    const [aiPaid, toolPaidRes] = await Promise.all([
      listMetronomeUsageWithGroups({
        customerId: metronomeCustomerId,
        billableMetricId: getMetricLlmProviderCostAwuId(),
        startingOn,
        endingBefore,
        windowSize: windowSizeUsed,
        groupKey: ["user_id", USAGE_TYPE_GROUP_KEY],
        groupFilters: { [USAGE_TYPE_GROUP_KEY]: paidUsageTypes },
      }),
      listMetronomeUsageWithGroups({
        customerId: metronomeCustomerId,
        billableMetricId: getMetricToolInvocationsId(),
        startingOn,
        endingBefore,
        windowSize: windowSizeUsed,
        groupKey: ["user_id", USAGE_TYPE_GROUP_KEY, "tool_category"],
        groupFilters: { [USAGE_TYPE_GROUP_KEY]: paidUsageTypes },
      }),
    ]);
    let canonLlm = 0;
    let canonLlmTrimmed = 0;
    if (aiPaid.isOk()) {
      for (const e of aiPaid.value) {
        if (e.group?.["user_id"] !== userId || e.value === null) {
          continue;
        }
        if (new Date(e.startingOn).getTime() < cycleStartMs) {
          canonLlmTrimmed += e.value;
        } else {
          canonLlm += e.value;
        }
      }
    }
    let canonTool = 0;
    if (toolPaidRes.isOk()) {
      for (const e of toolPaidRes.value) {
        const category = e.group?.["tool_category"];
        if (
          e.group?.["user_id"] !== userId ||
          e.value === null ||
          !category ||
          !isToolCategory(category) ||
          new Date(e.startingOn).getTime() < cycleStartMs
        ) {
          continue;
        }
        canonTool += e.value * TOOL_CATEGORY_AWU_WEIGHTS[category];
      }
    }
    logger.info(
      {
        windowSizeUsed,
        canonicalQueryLlm: canonLlm,
        canonicalQueryTool: canonTool,
        canonicalQueryTotal: canonLlm + canonTool,
        canonicalQueryLlmTrimmed: canonLlmTrimmed,
        userIdFilterTotal: llmPaid + toolPaid,
      },
      "[debug] Canonical query (usage_type filter) vs user_id-filter query"
    );

    // --- Per-bucket DIFF: which exact hours lose value under usage_type ----
    // Build per-hour LLM maps for this user from both already-fetched queries
    // (user_id filter = aiResult, usage_type filter = aiPaid) and log the hours
    // where they disagree — i.e. exactly which usage the usage_type filter eats.
    const byUserHour = new Map<string, number>();
    if (aiResult.isOk()) {
      for (const e of aiResult.value) {
        if (e.group?.["user_id"] !== userId || e.value === null) {
          continue;
        }
        byUserHour.set(
          e.startingOn,
          (byUserHour.get(e.startingOn) ?? 0) + e.value
        );
      }
    }
    const byTypeHour = new Map<string, number>();
    if (aiPaid.isOk()) {
      for (const e of aiPaid.value) {
        if (e.group?.["user_id"] !== userId || e.value === null) {
          continue;
        }
        byTypeHour.set(
          e.startingOn,
          (byTypeHour.get(e.startingOn) ?? 0) + e.value
        );
      }
    }
    const allHours = new Set([...byUserHour.keys(), ...byTypeHour.keys()]);
    for (const h of [...allHours].sort()) {
      const u = byUserHour.get(h) ?? 0;
      const t = byTypeHour.get(h) ?? 0;
      if (u !== t) {
        logger.info(
          {
            startingOn: h,
            userIdFilterAwu: u,
            usageTypeFilterAwu: t,
            diff: u - t,
          },
          "[debug] LLM bucket MISMATCH (user_id vs usage_type filter)"
        );
      }
    }

    // --- Fix candidate: same metrics & group keys, NO usage_type filter ----
    // (drop free in code). Logs row counts to detect truncation/empty results.
    const [aiFix, toolFix] = await Promise.all([
      listMetronomeUsageWithGroups({
        customerId: metronomeCustomerId,
        billableMetricId: getMetricLlmProviderCostAwuId(),
        startingOn,
        endingBefore,
        windowSize: windowSizeUsed,
        groupKey: ["user_id", USAGE_TYPE_GROUP_KEY],
      }),
      listMetronomeUsageWithGroups({
        customerId: metronomeCustomerId,
        billableMetricId: getMetricToolInvocationsId(),
        startingOn,
        endingBefore,
        windowSize: windowSizeUsed,
        groupKey: ["user_id", USAGE_TYPE_GROUP_KEY, "tool_category"],
      }),
    ]);
    let fixLlm = 0;
    let fixTool = 0;
    let fixLlmRows = 0;
    let fixToolRows = 0;
    if (aiFix.isOk()) {
      for (const e of aiFix.value) {
        fixLlmRows++;
        if (
          e.group?.["user_id"] !== userId ||
          e.value === null ||
          e.group?.[USAGE_TYPE_GROUP_KEY] === "free" ||
          new Date(e.startingOn).getTime() < cycleStartMs
        ) {
          continue;
        }
        fixLlm += e.value;
      }
    }
    if (toolFix.isOk()) {
      for (const e of toolFix.value) {
        fixToolRows++;
        const category = e.group?.["tool_category"];
        if (
          e.group?.["user_id"] !== userId ||
          e.value === null ||
          e.group?.[USAGE_TYPE_GROUP_KEY] === "free" ||
          !category ||
          !isToolCategory(category) ||
          new Date(e.startingOn).getTime() < cycleStartMs
        ) {
          continue;
        }
        fixTool += e.value * TOOL_CATEGORY_AWU_WEIGHTS[category];
      }
    }
    logger.info(
      {
        aiFixOk: aiFix.isOk(),
        toolFixOk: toolFix.isOk(),
        aiFixErr: aiFix.isErr() ? aiFix.error.message : null,
        toolFixErr: toolFix.isErr() ? toolFix.error.message : null,
        fixLlmRowsTotal: fixLlmRows,
        fixToolRowsTotal: fixToolRows,
        fixLlm,
        fixTool,
        fixTotal: fixLlm + fixTool,
        seatLedgerConsumedAwu: seatConsumed,
      },
      "[debug] Fix candidate (remove usage_type filter, drop free in code) vs seat"
    );

    // --- Canonical Consumed + reconciliation -------------------------------
    const consumedMap = await fetchPerUserAwuUsage({
      metronomeCustomerId,
      metronomeContractId,
      userIds: [userId],
    });
    const canonicalConsumed = consumedMap.isOk()
      ? (consumedMap.value.get(userId) ?? 0)
      : null;

    logger.info(
      {
        paidConsumedRecomputed: llmPaid + toolPaid,
        canonicalConsumed,
        breakdown: {
          llmPaid,
          toolPaid,
          llmFree,
          toolFree,
          llmTrimmedPreStart: llmTrimmed,
          toolTrimmedPreStart: toolTrimmed,
        },
        seatLedgerConsumedAwu: seatConsumed,
        consumedMinusSeatLedger:
          canonicalConsumed !== null && seatConsumed !== null
            ? canonicalConsumed - seatConsumed
            : null,
      },
      "[debug] Reconciliation — Consumed vs seat ledger"
    );
  }
);
