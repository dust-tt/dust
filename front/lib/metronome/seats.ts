import {
  getMetronomeClient,
  updateSubscriptionQuantity,
} from "@app/lib/metronome/client";
import { getProductWorkspaceSeatId } from "@app/lib/metronome/constants";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Find the seat subscription ID on a contract by matching the Workspace Seat product ID.
 */
async function getSeatSubscriptionId(
  metronomeCustomerId: string,
  contractId: string
): Promise<string | undefined> {
  const client = getMetronomeClient();
  const seatProductId = getProductWorkspaceSeatId();

  const response = await client.v2.contracts.list({
    customer_id: metronomeCustomerId,
  });
  const contract = response.data.find(
    (c: { id: string }) => c.id === contractId
  );
  if (!contract?.subscriptions?.length) {
    return undefined;
  }

  const seatSub = contract.subscriptions.find(
    (s: { subscription_rate: { product: { id: string } } }) =>
      s.subscription_rate.product.id === seatProductId
  );
  return seatSub?.id ?? undefined;
}

/**
 * Increment seat count by 1 when a member joins.
 * Called from membership create hook.
 */
export async function addSeat({
  metronomeCustomerId,
  contractId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  contractId: string;
  userId: string;
  workspaceId: string;
}): Promise<Result<void, Error>> {
  const subscriptionId = await getSeatSubscriptionId(
    metronomeCustomerId,
    contractId
  );
  if (!subscriptionId) {
    return new Err(new Error("No seat subscription found on contract"));
  }

  return await updateSubscriptionQuantity({
    metronomeCustomerId,
    contractId,
    subscriptionId,
    quantityDelta: 1,
  });
}

/**
 * Decrement seat count by 1 when a member leaves.
 * Called from membership revoke hook.
 */
export async function removeSeat({
  metronomeCustomerId,
  contractId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  contractId: string;
  userId: string;
  workspaceId: string;
}): Promise<Result<void, Error>> {
  const subscriptionId = await getSeatSubscriptionId(
    metronomeCustomerId,
    contractId
  );
  if (!subscriptionId) {
    return new Err(new Error("No seat subscription found on contract"));
  }

  return await updateSubscriptionQuantity({
    metronomeCustomerId,
    contractId,
    subscriptionId,
    quantityDelta: -1,
  });
}

/**
 * Set absolute seat count to match the current workspace member count.
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
  const subscriptionId = await getSeatSubscriptionId(
    metronomeCustomerId,
    contractId
  );
  if (!subscriptionId) {
    logger.warn(
      { workspaceId: workspace.sId, contractId },
      "[Metronome] No seat subscription found on contract — cannot provision seats"
    );
    return new Err(new Error("No seat subscription found on contract"));
  }

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });
  const memberCount = memberships.length;

  if (memberCount === 0) {
    logger.info(
      { workspaceId: workspace.sId },
      "[Metronome] No active members — no seats to provision"
    );
    return new Ok(undefined);
  }

  return await updateSubscriptionQuantity({
    metronomeCustomerId,
    contractId,
    subscriptionId,
    quantity: memberCount,
    startingAt,
  });
}
