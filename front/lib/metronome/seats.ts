import {
  getMetronomeClient,
  updateSubscriptionQuantity,
} from "@app/lib/metronome/client";
import { getProductWorkspaceSeatId } from "@app/lib/metronome/constants";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
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
 * Sync the Metronome seat subscription quantity to the current active member count.
 * Always sets the absolute quantity — safe against race conditions.
 *
 * Called from:
 * - membership create/revoke/update hooks (addSeat/removeSeat wrappers)
 * - contract provisioning after creation or migration
 */
export async function syncSeatCount({
  metronomeCustomerId,
  contractId,
  workspace,
  startingAt,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspace: LightWorkspaceType;
  startingAt?: string;
}): Promise<Result<void, Error>> {
  const subscriptionId = await getSeatSubscriptionId(
    metronomeCustomerId,
    contractId
  );
  if (!subscriptionId) {
    logger.warn(
      { workspaceId: workspace.sId, contractId },
      "[Metronome] No seat subscription found on contract — cannot sync seats"
    );
    return new Err(new Error("No seat subscription found on contract"));
  }

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });
  const memberCount = memberships.length;

  return await updateSubscriptionQuantity({
    metronomeCustomerId,
    contractId,
    subscriptionId,
    quantity: Math.max(memberCount, 1),
    startingAt,
  });
}
