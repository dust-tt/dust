/**
 * Backfill the per-seat `low_remaining_seat_balance_reached` Metronome alerts
 * for every seat-based ("personal credits") workspace.
 *
 * For each workspace with an active Metronome contract that has at least one
 * seat subscription, idempotently upserts the seat-balance alerts (the
 * exhausted/0 and the low-balance thresholds, fanned out per user via
 * seat_filter). Pool-only workspaces are skipped.
 *
 * The alerts are also provisioned going forward at Metronome customer creation
 * (see `ensureMetronomeCustomerForWorkspace`); this script reconciles existing
 * customers created before that hook.
 *
 * Run with:
 *   npx tsx scripts/backfill_metronome_seat_balance_alerts.ts [--execute] [--workspaceId <sId>]
 */

import {
  syncMetronomeSeatLowBalanceAlerts,
  upsertMetronomeSeatExhaustedAlert,
} from "@app/lib/metronome/alerts/seat_balance";
import { getMetronomeContractById } from "@app/lib/metronome/client";
import { hasContractSeatSubscription } from "@app/lib/metronome/seats";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import type { Logger } from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

async function backfillSeatBalanceAlertForWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return;
  }

  const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );
  const metronomeContractId = subscription?.metronomeContractId;
  if (!metronomeContractId) {
    return;
  }

  const contractResult = await getMetronomeContractById({
    metronomeCustomerId,
    metronomeContractId,
  });
  if (contractResult.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        metronomeContractId,
        error: contractResult.error.message,
      },
      "[SeatBalanceAlertBackfill] Failed to fetch contract"
    );
    return;
  }

  // Only seat-based ("personal credits") workspaces need the alert. Pool-only
  // workspaces have no seat balances for it to track.
  const isSeatBased = await hasContractSeatSubscription(contractResult.value);
  if (!isSeatBased) {
    return;
  }

  if (!execute) {
    logger.info(
      { workspaceId: workspace.sId, metronomeCustomerId },
      "[SeatBalanceAlertBackfill] [DRY RUN] Would upsert seat-balance alerts"
    );
    return;
  }

  const exhaustedResult = await upsertMetronomeSeatExhaustedAlert({
    metronomeCustomerId,
    workspaceId: workspace.sId,
  });
  if (exhaustedResult.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        metronomeCustomerId,
        error: exhaustedResult.error.message,
      },
      "[SeatBalanceAlertBackfill] Failed to upsert seat-exhaustion alert"
    );
    return;
  }

  const lowBalanceResult = await syncMetronomeSeatLowBalanceAlerts({
    metronomeCustomerId,
    contractId: metronomeContractId,
    workspaceId: workspace.sId,
  });
  if (lowBalanceResult.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        metronomeCustomerId,
        error: lowBalanceResult.error.message,
      },
      "[SeatBalanceAlertBackfill] Failed to sync seat low-balance alerts"
    );
    return;
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      metronomeCustomerId,
    },
    "[SeatBalanceAlertBackfill] Synced seat-balance alerts"
  );
}

makeScript(
  {
    workspaceId: {
      type: "string" as const,
      description:
        "Optional workspace sId to process (processes all if omitted)",
      required: false,
    },
  },
  async ({ workspaceId, execute }, logger) => {
    await runOnAllWorkspaces(
      async (workspace) => {
        await backfillSeatBalanceAlertForWorkspace(workspace, execute, logger);
      },
      { concurrency: 4, wId: workspaceId }
    );
  }
);
