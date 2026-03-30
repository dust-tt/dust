import config from "@app/lib/api/config";
import {
  editMetronomeContractSeats,
  getMetronomeActiveContract,
  listMetronomeProducts,
} from "@app/lib/metronome/client";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";

export type SeatType = "pro" | "max";

// Product names in Metronome that correspond to seat types.
const SEAT_TYPE_PRODUCT_NAMES: Record<SeatType, string> = {
  pro: "Pro Seat",
  max: "Max Seat",
};

// In-process cache: product name → product ID, populated on first use.
let productIdCache: Record<string, string> | null = null;

async function getProductIdForSeatType(
  seatType: SeatType
): Promise<string | null> {
  if (!productIdCache) {
    const result = await listMetronomeProducts();
    if (result.isErr()) {
      logger.warn(
        { error: result.error.message },
        "[Metronome] Failed to fetch products for seat type resolution"
      );
      return null;
    }
    productIdCache = Object.fromEntries(
      result.value.map((p) => [p.name, p.id])
    );
  }
  return productIdCache[SEAT_TYPE_PRODUCT_NAMES[seatType]] ?? null;
}

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
  const [fromProductId, toProductId] = await Promise.all([
    getProductIdForSeatType(fromSeatType),
    getProductIdForSeatType(toSeatType),
  ]);
  const fromSubId = fromProductId ? seatSubscriptions[fromProductId] : null;
  const toSubId = toProductId ? seatSubscriptions[toProductId] : null;

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
  const proProductId = await getProductIdForSeatType("pro");
  const proSubId = proProductId ? seatSubscriptions[proProductId] : null;

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
  const productId = await getProductIdForSeatType(seatType);
  const subId = productId ? seatSubscriptions[productId] : null;

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
