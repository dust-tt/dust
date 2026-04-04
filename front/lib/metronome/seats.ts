import {
  editMetronomeContractSeats,
  getMetronomeClient,
} from "@app/lib/metronome/client";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Find the default SEAT_BASED subscription on a contract.
 * For legacy packages there's only one; for new pricing, this returns the first
 * SEAT_BASED subscription (Guest/Pro/Max — caller decides which to use).
 */
export async function getDefaultSeatProductId(
  metronomeCustomerId: string,
  contractId: string
): Promise<string | undefined> {
  const client = getMetronomeClient();
  const response = await client.v2.contracts.list({
    customer_id: metronomeCustomerId,
  });
  const contract = response.data.find((c) => c.id === contractId);
  if (!contract?.subscriptions?.length) {
    return undefined;
  }

  const seatSub = contract.subscriptions.find(
    (s) => s.quantity_management_mode === "SEAT_BASED"
  );
  return seatSub?.id ?? undefined;
}

/**
 * Add a single member as a seat on a contract's default seat subscription.
 * Called from membership create hook.
 */
export async function addSeat({
  metronomeCustomerId,
  contractId,
  userId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  contractId: string;
  userId: string;
  workspaceId: string;
}): Promise<Result<void, Error>> {
  const seatProductId = await getDefaultSeatProductId(
    metronomeCustomerId,
    contractId
  );
  if (!seatProductId) {
    return new Err(new Error("No SEAT_BASED subscription found on contract"));
  }

  return await editMetronomeContractSeats({
    metronomeCustomerId,
    contractId,
    edits: [{ subscriptionId: seatProductId, addSeatIds: [userId] }],
  });
}

/**
 * Remove a single member's seat from a contract.
 * Called from membership revoke hook.
 */
export async function removeSeat({
  metronomeCustomerId,
  contractId,
  userId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  contractId: string;
  userId: string;
  workspaceId: string;
}): Promise<Result<void, Error>> {
  const seatProductId = await getDefaultSeatProductId(
    metronomeCustomerId,
    contractId
  );
  if (!seatProductId) {
    return new Err(new Error("No SEAT_BASED subscription found on contract"));
  }

  return await editMetronomeContractSeats({
    metronomeCustomerId,
    contractId,
    edits: [{ subscriptionId: seatProductId, removeSeatIds: [userId] }],
  });
}

/**
 * Add all active workspace members as seats on a contract's default seat subscription.
 * Called after contract creation (both new provisioning and migration).
 */
export async function provisionSeatsForContract({
  metronomeCustomerId,
  contractId,
  workspace,
  startingAt,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspace: LightWorkspaceType;
  startingAt: string;
}): Promise<Result<void, Error>> {
  const subscriptionId = await getDefaultSeatProductId(
    metronomeCustomerId,
    contractId
  );
  if (!subscriptionId) {
    logger.warn(
      { workspaceId: workspace.sId, contractId },
      "[Metronome] No SEAT_BASED subscription found on contract — cannot provision seats"
    );
    return new Err(new Error("No SEAT_BASED subscription found on contract"));
  }

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });
  const memberIds = memberships
    .map((m) => m.user?.sId)
    .filter((s): s is string => !!s);

  if (memberIds.length === 0) {
    logger.info(
      { workspaceId: workspace.sId },
      "[Metronome] No active members — no seats to provision"
    );
    return new Ok(undefined);
  }

  return await editMetronomeContractSeats({
    metronomeCustomerId,
    contractId,
    edits: [{ subscriptionId, addSeatIds: memberIds }],
    startingAt,
  });
}
