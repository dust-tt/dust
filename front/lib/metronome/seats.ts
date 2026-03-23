import config from "@app/lib/api/config";
import {
  editMetronomeContractSeats,
  getMetronomeActiveContract,
} from "@app/lib/metronome/client";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";

// Product IDs for seat types — must match Metronome sandbox setup.
const PRO_SEAT_PRODUCT_ID = "3bb03593-45b2-4b37-a2ce-3c2f41421f90";
const MAX_SEAT_PRODUCT_ID = "9cec1c4a-a879-473d-a6aa-55d3e6b4b705";

export type SeatType = "pro" | "max";

const SEAT_TYPE_PRODUCT_MAP: Record<SeatType, string> = {
  pro: PRO_SEAT_PRODUCT_ID,
  max: MAX_SEAT_PRODUCT_ID,
};

/**
 * Add a Pro seat for a user on the workspace's Metronome contract.
 * Called when a member joins a Metronome-billed workspace.
 * Fire-and-forget: logs errors but does not throw.
 */
export async function addMetronomeProSeat(
  workspace: WorkspaceResource,
  userSId: string
): Promise<void> {
  await addMetronomeSeat(workspace, userSId, "pro");
}

/**
 * Remove a user's seat from the workspace's Metronome contract.
 * Called when a member is revoked. Tries both Pro and Max subscriptions.
 * Fire-and-forget: logs errors but does not throw.
 */
export async function removeMetronomeSeat(
  workspace: WorkspaceResource,
  userSId: string
): Promise<void> {
  if (!config.isMetronomeEnabled() || !workspace.metronomeCustomerId) {
    return;
  }

  const contractResult = await getMetronomeActiveContract(
    workspace.metronomeCustomerId
  );
  if (contractResult.isErr() || !contractResult.value) {
    return;
  }

  const { contractId, seatSubscriptions } = contractResult.value;

  // Remove from all seat subscriptions (user can only be on one, but safe to try both).
  const edits = Object.values(seatSubscriptions).map((subId) => ({
    subscription_id: subId,
    remove_seat_ids: [userSId],
  }));

  if (edits.length > 0) {
    await editMetronomeContractSeats({
      metronomeCustomerId: workspace.metronomeCustomerId,
      contractId,
      subscriptionEdits: edits,
    });
  }
}

/**
 * Change a user's seat type (e.g., Pro → Max or Max → Pro).
 * Removes from old subscription + adds unassigned seat, adds to new subscription.
 */
export async function changeMetronomeSeatType(
  workspace: WorkspaceResource,
  userSId: string,
  fromSeatType: SeatType,
  toSeatType: SeatType
): Promise<void> {
  if (!config.isMetronomeEnabled() || !workspace.metronomeCustomerId) {
    return;
  }

  const contractResult = await getMetronomeActiveContract(
    workspace.metronomeCustomerId
  );
  if (contractResult.isErr() || !contractResult.value) {
    return;
  }

  const { contractId, seatSubscriptions } = contractResult.value;
  const fromSubId = seatSubscriptions[SEAT_TYPE_PRODUCT_MAP[fromSeatType]];
  const toSubId = seatSubscriptions[SEAT_TYPE_PRODUCT_MAP[toSeatType]];

  if (!fromSubId || !toSubId) {
    logger.warn(
      { workspaceSId: workspace.sId, userSId, fromSeatType, toSeatType },
      "[Metronome] Missing subscription for seat type change"
    );
    return;
  }

  await editMetronomeContractSeats({
    metronomeCustomerId: workspace.metronomeCustomerId,
    contractId,
    subscriptionEdits: [
      {
        subscription_id: fromSubId,
        remove_seat_ids: [userSId],
        add_unassigned_seats: 1,
      },
      {
        subscription_id: toSubId,
        add_seat_ids: [userSId],
      },
    ],
  });
}

/**
 * Add all workspace members as Pro seats on a Metronome contract.
 * Called after contract creation during checkout.
 */
export async function addAllMembersAsProSeats(
  workspace: WorkspaceResource,
  memberSIds: string[]
): Promise<void> {
  if (
    !config.isMetronomeEnabled() ||
    !workspace.metronomeCustomerId ||
    memberSIds.length === 0
  ) {
    return;
  }

  const contractResult = await getMetronomeActiveContract(
    workspace.metronomeCustomerId
  );
  if (contractResult.isErr() || !contractResult.value) {
    return;
  }

  const { contractId, seatSubscriptions } = contractResult.value;
  const proSubId = seatSubscriptions[PRO_SEAT_PRODUCT_ID];

  if (!proSubId) {
    logger.warn(
      { workspaceSId: workspace.sId },
      "[Metronome] No Pro seat subscription found on contract"
    );
    return;
  }

  await editMetronomeContractSeats({
    metronomeCustomerId: workspace.metronomeCustomerId,
    contractId,
    subscriptionEdits: [
      {
        subscription_id: proSubId,
        add_seat_ids: memberSIds,
      },
    ],
  });
}

async function addMetronomeSeat(
  workspace: WorkspaceResource,
  userSId: string,
  seatType: SeatType
): Promise<void> {
  if (!config.isMetronomeEnabled() || !workspace.metronomeCustomerId) {
    return;
  }

  const contractResult = await getMetronomeActiveContract(
    workspace.metronomeCustomerId
  );
  if (contractResult.isErr() || !contractResult.value) {
    return;
  }

  const { contractId, seatSubscriptions } = contractResult.value;
  const subId = seatSubscriptions[SEAT_TYPE_PRODUCT_MAP[seatType]];

  if (!subId) {
    logger.warn(
      { workspaceSId: workspace.sId, userSId, seatType },
      "[Metronome] No subscription found for seat type"
    );
    return;
  }

  await editMetronomeContractSeats({
    metronomeCustomerId: workspace.metronomeCustomerId,
    contractId,
    subscriptionEdits: [
      {
        subscription_id: subId,
        add_seat_ids: [userSId],
      },
    ],
  });
}
