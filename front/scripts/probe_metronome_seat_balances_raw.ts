/**
 * Read-only probe: dump the RAW `/v1/contracts/seatBalances/list` response for a
 * single seat, WITHOUT the trimming `listMetronomeSeatBalances` applies (its
 * typed `MetronomeSeatBalance` keeps only `balances[{credit_type_id, balance,
 * starting_balance}]` — i.e. aggregated per credit TYPE).
 *
 * The question we're answering: with `include_credits_and_commits: true`, does
 * each seat entry break its balance down per individual CREDIT (a `credit_id` /
 * `credits[]` / `commits[]` structure), or only per credit type? If per-credit
 * rows are present we can detect a stray seat credit directly (map each credit
 * to a seat type via `subscription_config.subscription_id`, flag any that don't
 * match the user's current seat); if not, we stay on the aggregate-vs-allocation
 * reconcile.
 *
 * Purely diagnostic — one READ call. Logs the full raw entry for the seat.
 *
 *   npx tsx scripts/probe_metronome_seat_balances_raw.ts --workspaceId <wId> --seatId <userId>
 */
import config from "@app/lib/api/config";
import { getMetronomeClient } from "@app/lib/metronome/client";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { normalizeError } from "@app/types/shared/utils/error_utils";

import { makeScript } from "./helpers";

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      describe: "sId of the workspace",
    },
    seatIds: {
      type: "string",
      demandOption: true,
      describe:
        "Comma-separated seat ids (= user sIds) to dump raw seat balances " +
        "for. Pass 2+ seats on a MULTI-user workspace to prove credits[] is " +
        "per-seat (each seat's credits[] differs and sums to that seat's own " +
        "aggregate) rather than a workspace-wide roll-up.",
    },
  },
  async ({ workspaceId, seatIds: seatIdsArg }, logger) => {
    const seatIds = seatIdsArg
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (!config.getMetronomeApiKey()) {
      logger.error(
        {},
        "[SeatBalancesProbe] METRONOME_API_KEY is not configured"
      );
      return;
    }
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      logger.error({ workspaceId }, "[SeatBalancesProbe] workspace not found");
      return;
    }
    const { metronomeCustomerId } = renderLightWorkspaceType({ workspace });
    if (!metronomeCustomerId) {
      logger.error(
        { workspaceId },
        "[SeatBalancesProbe] workspace not provisioned on Metronome"
      );
      return;
    }
    const activeSubscription =
      await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
    const contractId = activeSubscription?.metronomeContractId ?? null;
    if (!contractId) {
      logger.error(
        { workspaceId },
        "[SeatBalancesProbe] no active Metronome contract"
      );
      return;
    }

    // Log the contract's recurring credits so we can map any credit_id in the
    // response back to a seat type via subscription_config.subscription_id.
    const contract = await getActiveContract(workspaceId);
    logger.info(
      {
        workspaceId,
        contractId,
        recurringCredits: (contract?.recurring_credits ?? []).map((c) => ({
          creditId: c.id,
          name: c.product?.name,
          subscriptionId: c.subscription_config?.subscription_id,
        })),
      },
      "[SeatBalancesProbe] recurring credits on contract (credit_id → subscription)"
    );

    // The exact request `listMetronomeSeatBalances` makes, but we keep the raw
    // untyped response instead of narrowing to MetronomeSeatBalance. Query one
    // seat at a time so each response is unambiguously scoped to that seat_id —
    // this is what proves credits[] is per-seat, not a workspace roll-up: two
    // seats on the same contract must return DIFFERENT credits[].
    for (const seatId of seatIds) {
      try {
        const raw = await getMetronomeClient().post<{ data?: unknown[] }>(
          "/v1/contracts/seatBalances/list",
          {
            body: {
              customer_id: metronomeCustomerId,
              contract_id: contractId,
              include_credits_and_commits: true,
              covering_date: new Date().toISOString(),
              limit: 100,
              seat_ids: [seatId],
            },
          }
        );
        const entries = raw.data ?? [];
        // Compact per-seat comparison: the aggregate AWU balance (balances[])
        // next to the per-credit breakdown (credits[]) and its sum. If credits[]
        // is genuinely this seat's, its sum equals the seat's own aggregate; if
        // it were a workspace roll-up, the sum would exceed one seat's total and
        // be identical across seats.
        for (const entry of entries) {
          const e = entry as {
            seat_id?: string;
            balances?: Array<{ credit_type_id?: string; balance?: number }>;
            credits?: Array<{ id?: string; balance?: number }>;
          };
          const aggregateBalance = (e.balances ?? []).reduce(
            (sum, b) => sum + (b.balance ?? 0),
            0
          );
          const creditsSum = (e.credits ?? []).reduce(
            (sum, c) => sum + (c.balance ?? 0),
            0
          );
          logger.info(
            {
              workspaceId,
              seatId,
              entrySeatId: e.seat_id,
              aggregateBalance,
              creditsCount: (e.credits ?? []).length,
              creditsSum,
              credits: (e.credits ?? []).map((c) => ({
                id: c.id,
                balance: c.balance,
              })),
            },
            "[SeatBalancesProbe] per-seat balance breakdown"
          );
        }
        // Also dump each entry in full for the raw record.
        for (const [index, entry] of entries.entries()) {
          logger.info(
            { workspaceId, seatId, index, rawEntry: JSON.stringify(entry) },
            "[SeatBalancesProbe] raw seatBalances/list entry"
          );
        }
      } catch (err) {
        logger.error(
          { workspaceId, seatId, error: normalizeError(err).message },
          "[SeatBalancesProbe] raw seatBalances/list request failed"
        );
      }
    }
  }
);
