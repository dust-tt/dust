import type { Authenticator } from "@app/lib/auth";
import { getMetronomeSubscriptionSeatState } from "@app/lib/metronome/client";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
} from "@app/lib/metronome/seat_types";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";
import type { LightWorkspaceType } from "@app/types/user";
import type { Subscription } from "@metronome/sdk/resources";

export type GetMembersSeatsResponseBody = {
  // Active members per seat type, from the DB ("assigned" seats).
  seatTypes: Partial<Record<MembershipSeatType, number>>;
  // Total seat quantity billed in Metronome per seat type (assigned +
  // unassigned). Absent when the workspace isn't on a Metronome seat contract,
  // or omitted for a seat type if Metronome couldn't be read. The UI derives
  // the unassigned count as `metronomeSeats - seatTypes` per type.
  metronomeSeats: Partial<Record<MembershipSeatType, number>>;
  total: number;
};

/**
 * Read the current quantity from a subscription's `quantity_schedule` (used for
 * QUANTITY_ONLY seats — `workspace`/`free`). The schedule lists the current
 * quantity and future changes, each with a `starting_at`; pick the latest entry
 * that has started and not yet ended.
 *
 * NOTE: this is only valid for QUANTITY_ONLY subs. For SEAT_BASED subs the
 * schedule reports the base/proration quantity, not the seat-driven total —
 * those go through `getMetronomeSubscriptionSeatState` instead.
 */
function currentQuantityFromSchedule(sub: Subscription): number {
  const now = Date.now();
  let quantity = 0;
  let bestStartMs = Number.NEGATIVE_INFINITY;
  for (const entry of sub.quantity_schedule ?? []) {
    const startMs = Date.parse(entry.starting_at);
    const endsOk =
      !entry.ending_before || Date.parse(entry.ending_before) > now;
    if (startMs <= now && endsOk && startMs >= bestStartMs) {
      bestStartMs = startMs;
      quantity = entry.quantity;
    }
  }
  return quantity;
}

/**
 * Best-effort: the seat quantity billed in Metronome per seat type (assigned +
 * unassigned). Returns `{}` when the workspace has no Metronome seat contract,
 * and silently omits any seat type whose live state can't be read so the DB
 * counts are always returned.
 */
async function getMetronomeBilledSeatsByType(
  workspace: LightWorkspaceType
): Promise<Partial<Record<MembershipSeatType, number>>> {
  if (!workspace.metronomeCustomerId) {
    return {};
  }

  const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );
  if (!subscription?.metronomeContractId) {
    return {};
  }

  const contract = await getActiveContract(workspace.sId);
  if (!contract) {
    return {};
  }

  const productSeatTypes = await getProductSeatTypes();
  const seatSubscriptions: Array<[MembershipSeatType, Subscription]> = [
    ...getSeatSubscriptionsFromContract(contract, productSeatTypes),
  ];

  const metronomeCustomerId = workspace.metronomeCustomerId;
  const contractId = subscription.metronomeContractId;

  const results = await concurrentExecutor(
    seatSubscriptions,
    async ([seatType, sub]): Promise<[MembershipSeatType, number] | null> => {
      if (!sub.id) {
        return null;
      }
      if (sub.quantity_management_mode === "SEAT_BASED") {
        const state = await getMetronomeSubscriptionSeatState({
          metronomeCustomerId,
          contractId,
          subscriptionId: sub.id,
        });
        if (state.isErr()) {
          logger.warn(
            { workspaceId: workspace.sId, seatType, err: state.error },
            "[Metronome] Failed to read seat state for billed-seats overview"
          );
          return null;
        }
        return [
          seatType,
          state.value.assignedSeatIds.length + state.value.unassignedSeats,
        ];
      }
      // QUANTITY_ONLY: the billed quantity lives on the quantity schedule.
      return [seatType, currentQuantityFromSchedule(sub)];
    },
    { concurrency: 4 }
  );

  const metronomeSeats: Partial<Record<MembershipSeatType, number>> = {};
  for (const result of results) {
    if (result) {
      metronomeSeats[result[0]] = result[1];
    }
  }
  return metronomeSeats;
}

export async function getMembersSeats({
  auth,
}: {
  auth: Authenticator;
}): Promise<GetMembersSeatsResponseBody> {
  const workspace = auth.getNonNullableWorkspace();
  const seatTypes =
    await MembershipResource.getActiveSeatTypeCountsForWorkspace({
      workspace,
    });

  const metronomeSeats = await getMetronomeBilledSeatsByType(workspace);

  return {
    seatTypes,
    metronomeSeats,
    total: Object.values(seatTypes).reduce((sum, count) => sum + count, 0),
  };
}
