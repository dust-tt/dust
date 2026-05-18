/**
 * Backfill Workspace Seat quantity history on Metronome from the memberships table.
 *
 * For each workspace with an active Metronome contract:
 * - Fetches the active contract.
 * - Looks for the "Workspace Seat" subscription on the contract; skips if absent.
 * - Reads the seat subscription's current billing period start.
 * - Reconstructs the seat count timeline within the current billing period using
 *   MembershipModel rows (membership active for time t when startAt <= t < endAt
 *   or endAt is null). Emits the initial count at the period start, then one
 *   entry per change.
 * - Sends a single batched v2.contracts.edit call with the quantity_updates
 *   (hour-floored, same-hour events collapsed, no-op changes dropped).
 *
 * Run with:
 *   npx tsx scripts/backfill_metronome_seat_count.ts [--execute] [--workspaceId <sId>]
 */

import {
  floorToHourISO,
  getMetronomeClient,
  getMetronomeContractById,
} from "@app/lib/metronome/client";
import { getProductWorkspaceSeatId } from "@app/lib/metronome/constants";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import type { Logger } from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

interface SeatTimelineEntry {
  startingAt: string; // hour-floored ISO
  quantity: number;
}

/**
 * Build the (hour-floored, deduped) seat-count timeline within the current
 * billing period. The first entry sets the count at periodStart itself.
 */
async function buildSeatTimeline({
  workspace,
  periodStart,
}: {
  workspace: LightWorkspaceType;
  periodStart: Date;
}): Promise<SeatTimelineEntry[]> {
  const now = new Date();

  // Initial count: memberships active at periodStart.
  const initialCount = await MembershipModel.count({
    where: {
      workspaceId: workspace.id,
      startAt: { [Op.lte]: periodStart },
      [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: periodStart } }],
    },
  });

  // All memberships whose startAt or endAt falls in (periodStart, now].
  const memberships = await MembershipModel.findAll({
    attributes: ["startAt", "endAt"],
    where: {
      workspaceId: workspace.id,
      [Op.or]: [
        { startAt: { [Op.gt]: periodStart, [Op.lte]: now } },
        { endAt: { [Op.gt]: periodStart, [Op.lte]: now } },
      ],
    },
  });

  const events: Array<{ at: Date; delta: number }> = [];
  for (const m of memberships) {
    if (m.startAt > periodStart && m.startAt <= now) {
      events.push({ at: m.startAt, delta: 1 });
    }
    if (m.endAt && m.endAt > periodStart && m.endAt <= now) {
      events.push({ at: m.endAt, delta: -1 });
    }
  }

  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  // Always emit the initial count at periodStart so the seat quantity is reset
  // at the start of the billing period.
  const timeline: SeatTimelineEntry[] = [
    {
      startingAt: floorToHourISO(periodStart),
      quantity: initialCount,
    },
  ];
  let runningCount = initialCount;
  let lastEmittedQuantity = timeline[0].quantity;
  let pendingHour: string | null = null;

  for (const ev of events) {
    const hourIso = floorToHourISO(ev.at);

    // Moved past the previous hour: flush its accumulated quantity.
    if (pendingHour !== null && hourIso !== pendingHour) {
      if (runningCount !== lastEmittedQuantity) {
        timeline.push({ startingAt: pendingHour, quantity: runningCount });
        lastEmittedQuantity = runningCount;
      }
      pendingHour = null;
    }

    runningCount += ev.delta;
    pendingHour = hourIso;
  }

  // Flush the final pending hour.
  if (pendingHour !== null && runningCount !== lastEmittedQuantity) {
    timeline.push({ startingAt: pendingHour, quantity: runningCount });
  }

  return timeline;
}

async function backfillSeatCountForWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  if (workspace.metadata?.maintenance) {
    logger.info(
      { workspaceId: workspace.sId },
      "[SeatBackfill] Workspace in maintenance, skipping"
    );
    return;
  }

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
      "[SeatBackfill] Failed to fetch contract"
    );
    return;
  }

  const contract = contractResult.value;
  const seatProductId = getProductWorkspaceSeatId();
  const seatSubscription = contract.subscriptions?.find(
    (s) => s.subscription_rate.product.id === seatProductId
  );
  if (!seatSubscription?.id) {
    logger.info(
      { workspaceId: workspace.sId, metronomeContractId },
      "[SeatBackfill] No Workspace Seat subscription on contract, skipping"
    );
    return;
  }

  const currentPeriodStart =
    seatSubscription.billing_periods?.current?.starting_at;
  if (!currentPeriodStart) {
    logger.warn(
      { workspaceId: workspace.sId, metronomeContractId },
      "[SeatBackfill] Seat subscription has no current billing period, skipping"
    );
    return;
  }

  const periodStart = new Date(currentPeriodStart);
  if (Number.isNaN(periodStart.getTime())) {
    logger.warn(
      {
        workspaceId: workspace.sId,
        metronomeContractId,
        currentPeriodStart,
      },
      "[SeatBackfill] Invalid billing period starting_at, skipping"
    );
    return;
  }

  const timeline = await buildSeatTimeline({ workspace, periodStart });

  logger.info(
    {
      workspaceId: workspace.sId,
      metronomeContractId,
      subscriptionId: seatSubscription.id,
      periodStart: periodStart.toISOString(),
      changes: timeline.length,
      first: timeline[0],
      last: timeline[timeline.length - 1],
    },
    `[SeatBackfill] ${execute ? "Applying" : "[DRY RUN] Would apply"} ${timeline.length} seat quantity update(s)`
  );

  if (!execute) {
    for (const entry of timeline) {
      logger.info(
        { workspaceId: workspace.sId, ...entry },
        "[SeatBackfill] [DRY RUN] quantity update"
      );
    }
    return;
  }

  try {
    await getMetronomeClient().v2.contracts.edit({
      customer_id: metronomeCustomerId,
      contract_id: metronomeContractId,
      update_subscriptions: [
        {
          subscription_id: seatSubscription.id,
          quantity_updates: timeline.map((e) => ({
            starting_at: e.startingAt,
            quantity: e.quantity,
          })),
        },
      ],
    });
    logger.info(
      {
        workspaceId: workspace.sId,
        metronomeContractId,
        applied: timeline.length,
      },
      "[SeatBackfill] Applied seat quantity updates"
    );
  } catch (err) {
    logger.error(
      {
        workspaceId: workspace.sId,
        metronomeContractId,
        error: normalizeError(err).message,
      },
      "[SeatBackfill] Failed to apply seat quantity updates"
    );
  }
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
        await backfillSeatCountForWorkspace(workspace, execute, logger);
      },
      { concurrency: 4, wId: workspaceId }
    );
  }
);
