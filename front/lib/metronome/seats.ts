import {
  getMetronomeContractById,
  updateSubscriptionQuantity,
} from "@app/lib/metronome/client";
import { getProductWorkspaceSeatId } from "@app/lib/metronome/constants";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

interface SeatContractLike {
  subscriptions?: Array<{
    id?: string;
    subscription_rate: { product: { id: string } };
  }>;
}

export function getSeatSubscriptionIdFromContract(
  contract: SeatContractLike
): string | undefined {
  const seatProductId = getProductWorkspaceSeatId();

  if (!contract.subscriptions?.length) {
    return undefined;
  }

  const seatSub = contract.subscriptions.find(
    (s) => s.subscription_rate.product.id === seatProductId
  );
  return seatSub?.id;
}

/**
 * Find the seat subscription ID on the given contract by matching the Workspace Seat product ID.
 */
async function getSeatSubscriptionIdOnContract({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
}): Promise<Result<string | undefined, Error>> {
  const contractResult = await getMetronomeContractById({
    metronomeCustomerId,
    metronomeContractId,
  });
  if (contractResult.isErr()) {
    logger.warn(
      {
        error: contractResult.error,
        metronomeCustomerId,
        metronomeContractId,
      },
      "[Metronome] Failed to retrieve contract while checking seat subscription"
    );
    return new Err(contractResult.error);
  }

  return new Ok(getSeatSubscriptionIdFromContract(contractResult.value));
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
  contract,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspace: LightWorkspaceType;
  startingAt?: string;
  contract?: SeatContractLike;
}): Promise<Result<void, Error>> {
  // When the contract is provided by the caller (provisioning, membership hooks),
  // use it directly to avoid a redundant fetch. Mirrors the same pattern as syncMauCount.
  let subscriptionId: string | undefined;
  if (contract) {
    subscriptionId = getSeatSubscriptionIdFromContract(contract);
  } else {
    const subscriptionIdResult = await getSeatSubscriptionIdOnContract({
      metronomeCustomerId,
      metronomeContractId: contractId,
    });
    if (subscriptionIdResult.isErr()) {
      return new Err(subscriptionIdResult.error);
    }

    subscriptionId = subscriptionIdResult.value;
  }
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

  logger.info(
    { workspaceId: workspace.sId, contractId, memberCount },
    "[Metronome] Updating seat quantities"
  );

  return await updateSubscriptionQuantity({
    metronomeCustomerId,
    contractId,
    subscriptionId,
    quantity: Math.max(memberCount, 1),
    startingAt,
  });
}
