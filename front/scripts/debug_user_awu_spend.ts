/**
 * Debug a single user's AWU "Consumed" figure against the live Metronome seat
 * balance and the raw per-hour usage, so we can reconcile discrepancies (e.g.
 * "Consumed 6113 but seat shows 1772/8000") and check whether the contract
 * starts on the hour.
 *
 * Read-only: ignores --execute. Dumps:
 *   - contract.starting_at and the current billing period bounds
 *   - the user's live seat AWU balance (balance + starting_balance)
 *   - per-hour cost_awu usage buckets for the user, split by usage_type,
 *     flagging buckets trimmed because they precede the period start
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
  USAGE_TYPE_GROUP_KEY,
  USAGE_TYPE_PROGRAMMATIC,
  USAGE_TYPE_USER,
} from "@app/lib/metronome/constants";
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
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

    const periodResult = await getCachedMetronomeCurrentBillingPeriod(
      workspace.sId
    );
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
      seatIds: [userId],
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

    const aiResult = await listMetronomeUsageWithGroups({
      customerId: metronomeCustomerId,
      billableMetricId: getMetricLlmProviderCostAwuId(),
      startingOn,
      endingBefore,
      windowSize: "HOUR",
      groupKey: ["user_id", USAGE_TYPE_GROUP_KEY],
      groupFilters: { user_id: [userId] },
    });
    if (aiResult.isErr()) {
      logger.error({ aiErr: aiResult.error }, "Failed to read usage");
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

    // --- Canonical query replica -------------------------------------------
    // Reproduce fetchPerUserAwuUsage's EXACT queries (usage_type filter, no
    // user_id filter; same windowSize logic) and sum for THIS user, to see
    // whether the usage_type filter — not the window — drops usage.
    const windowSizeUsed =
      cycleStartMs === floorToMidnightUTC(cycleStart).getTime()
        ? "DAY"
        : "HOUR";
    const paidUsageTypes = [USAGE_TYPE_USER, USAGE_TYPE_PROGRAMMATIC];
    const aiPaid = await listMetronomeUsageWithGroups({
      customerId: metronomeCustomerId,
      billableMetricId: getMetricLlmProviderCostAwuId(),
      startingOn,
      endingBefore,
      windowSize: windowSizeUsed,
      groupKey: ["user_id", USAGE_TYPE_GROUP_KEY],
      groupFilters: { [USAGE_TYPE_GROUP_KEY]: paidUsageTypes },
    });
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
    logger.info(
      {
        windowSizeUsed,
        canonicalQueryLlm: canonLlm,
        canonicalQueryLlmTrimmed: canonLlmTrimmed,
        userIdFilterTotal: llmPaid,
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
    const aiFix = await listMetronomeUsageWithGroups({
      customerId: metronomeCustomerId,
      billableMetricId: getMetricLlmProviderCostAwuId(),
      startingOn,
      endingBefore,
      windowSize: windowSizeUsed,
      groupKey: ["user_id", USAGE_TYPE_GROUP_KEY],
    });
    let fixLlm = 0;
    let fixLlmRows = 0;
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
    logger.info(
      {
        aiFixOk: aiFix.isOk(),
        aiFixErr: aiFix.isErr() ? aiFix.error.message : null,
        fixLlmRowsTotal: fixLlmRows,
        fixLlm,
        seatLedgerConsumedAwu: seatConsumed,
      },
      "[debug] Fix candidate (remove usage_type filter, drop free in code) vs seat"
    );

    // --- Canonical Consumed + reconciliation -------------------------------
    const consumedMap = await fetchPerUserAwuUsage({
      workspaceId,
      metronomeCustomerId,
      userIds: [userId],
    });
    const canonicalConsumed = consumedMap.isOk()
      ? (consumedMap.value.get(userId) ?? 0)
      : null;

    logger.info(
      {
        paidConsumedRecomputed: llmPaid,
        canonicalConsumed,
        breakdown: {
          llmPaid,
          llmFree,
          llmTrimmedPreStart: llmTrimmed,
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
