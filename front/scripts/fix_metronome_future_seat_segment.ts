/**
 * One-off correction for a corrupted FUTURE seat-subscription segment.
 *
 * Background: when a subscription is under its committed floor (so it carries
 * "unassigned" padding seats) AND has a scheduled future floor change, the seat
 * reconcile could loop, issuing open-ended `add/remove_unassigned` edits that
 * stacked in the post-boundary segment (Vanta incident: Pro segment from
 * 2026-11-13 ballooned to total 1141 / 548 unassigned instead of 730 / 137).
 * The current/now segment self-healed once the loop stopped, but the future
 * segment stayed inflated and would bill the wrong committed quantity once it
 * starts.
 *
 * This script recomputes, for each seat subscription that has a scheduled
 * future floor change, the correct unassigned count at each future boundary
 * (`minSeats − desiredAssigned`, floored at 0) and issues the exact
 * `add/remove_unassigned` delta at that boundary to converge it — a careful,
 * single-shot manual reconcile of the future segments only. The now/base
 * segment is left untouched.
 *
 * Dry-run by default; pass --execute to actually apply the edits.
 *
 *   npx tsx scripts/fix_metronome_future_seat_segment.ts --workspaceId <wId>
 *   npx tsx scripts/fix_metronome_future_seat_segment.ts --workspaceId <wId> --execute
 */
import config from "@app/lib/api/config";
import {
  getMetronomeSubscriptionSeatState,
  updateSubscriptionSeats,
} from "@app/lib/metronome/client";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
} from "@app/lib/metronome/seat_types";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { WorkspaceSeatLimitResource } from "@app/lib/resources/workspace_seat_limit_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";

import { makeScript } from "./helpers";

async function fixWorkspace(
  workspaceId: string,
  execute: boolean,
  logger: Logger
) {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    logger.error({ workspaceId }, "[SeatFix] workspace not found");
    return;
  }
  const lightWorkspace = renderLightWorkspaceType({ workspace });
  const { metronomeCustomerId } = lightWorkspace;
  if (!metronomeCustomerId) {
    logger.error({ workspaceId }, "[SeatFix] workspace not on Metronome");
    return;
  }

  const activeSubscription =
    await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
  const contractId = activeSubscription?.metronomeContractId ?? null;
  if (!contractId) {
    logger.error({ workspaceId }, "[SeatFix] no active Metronome contract");
    return;
  }
  const contract = await getActiveContract(workspaceId);
  if (!contract) {
    logger.error(
      { workspaceId, contractId },
      "[SeatFix] contract not resolved"
    );
    return;
  }

  const productSeatTypes = await getProductSeatTypes();
  const seatSubscriptions = [
    ...getSeatSubscriptionsFromContract(contract, productSeatTypes),
  ].flatMap(([seatType, sub]) => (sub.id ? [{ seatType, subId: sub.id }] : []));

  // Desired billed assigned count per seat type (active window + firstUsedAt
  // set — the same set syncSeatCount bills). No scheduled seat-type changes are
  // assumed here, so the assigned count is the same at every future boundary.
  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace: lightWorkspace,
  });
  const desiredAssignedBySeatType = new Map<MembershipSeatType, number>();
  for (const m of memberships) {
    if (m.user?.sId && m.firstUsedAt !== null) {
      desiredAssignedBySeatType.set(
        m.seatType,
        (desiredAssignedBySeatType.get(m.seatType) ?? 0) + 1
      );
    }
  }

  const schedule = await WorkspaceSeatLimitResource.fetchScheduleByWorkspace({
    workspace: lightWorkspace,
  });
  const nowMs = Date.now();

  for (const { seatType, subId } of seatSubscriptions) {
    const segments = schedule.get(seatType) ?? [];
    const futureBoundaries = segments
      .filter((s) => s.startAt.getTime() > nowMs)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    if (futureBoundaries.length === 0) {
      continue;
    }
    const desiredAssigned = desiredAssignedBySeatType.get(seatType) ?? 0;

    for (const seg of futureBoundaries) {
      const startingAt = seg.startAt.toISOString();
      // Read the segment as it is projected at its own start.
      const stateRes = await getMetronomeSubscriptionSeatState({
        metronomeCustomerId,
        contractId,
        subscriptionId: subId,
        coveringDate: seg.startAt,
      });
      if (stateRes.isErr()) {
        logger.error(
          { workspaceId, seatType, startingAt, err: stateRes.error.message },
          "[SeatFix] failed to read future segment state"
        );
        continue;
      }
      const currentUnassigned = stateRes.value.unassignedSeats;
      const currentAssigned = stateRes.value.assignedSeatIds.length;
      const desiredUnassigned = Math.max(0, seg.minSeats - desiredAssigned);
      const addUnassignedSeats = Math.max(
        0,
        desiredUnassigned - currentUnassigned
      );
      const removeUnassignedSeats = Math.max(
        0,
        currentUnassigned - desiredUnassigned
      );

      const plan = {
        workspaceId,
        seatType,
        subscriptionId: subId,
        startingAt,
        minSeats: seg.minSeats,
        desiredAssigned,
        currentAssigned,
        currentUnassigned,
        desiredUnassigned,
        addUnassignedSeats,
        removeUnassignedSeats,
      };

      if (currentAssigned !== desiredAssigned) {
        // Assigned mismatch is out of scope for this unassigned-only fixup —
        // surface it rather than guessing which seat IDs to move.
        logger.warn(
          plan,
          "[SeatFix] future segment assigned count != desired; skipping " +
            "(this script only corrects the unassigned pool)"
        );
        continue;
      }
      if (addUnassignedSeats === 0 && removeUnassignedSeats === 0) {
        logger.info(
          plan,
          "[SeatFix] future segment already correct — skipping"
        );
        continue;
      }

      if (!execute) {
        logger.info(
          plan,
          "[SeatFix] DRY RUN — would correct future segment unassigned pool"
        );
        continue;
      }

      const res = await updateSubscriptionSeats({
        metronomeCustomerId,
        contractId,
        fromSubscriptionId: subId,
        addUnassignedSeats,
        removeUnassignedSeats,
        startingAt,
      });
      if (res.isErr()) {
        logger.error(
          { ...plan, err: res.error.message },
          "[SeatFix] failed to correct future segment"
        );
        continue;
      }
      logger.info(plan, "[SeatFix] corrected future segment unassigned pool");
    }
  }
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      describe: "sId of the workspace to correct",
    },
  },
  async ({ workspaceId, execute }, logger) => {
    if (!config.getMetronomeApiKey()) {
      logger.error({}, "[SeatFix] METRONOME_API_KEY is not configured");
      return;
    }
    await fixWorkspace(workspaceId, execute, logger);
  }
);
