import {
  getMetronomeContractPackageAliases,
  updateSubscriptionQuantity,
} from "@app/lib/metronome/client";
import { getProductWorkspaceSeatId } from "@app/lib/metronome/constants";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { isSeatBasedMetronomePackageAlias } from "@app/lib/metronome/types";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Find the seat subscription ID on a contract by matching the Workspace Seat product ID.
 */
async function getSeatSubscriptionId(
  workspaceId: string
): Promise<string | undefined> {
  const seatProductId = getProductWorkspaceSeatId();

  const contract = await getActiveContract(workspaceId);
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
 * Returns whether Metronome contract belongs to a seat-based package family.
 * MAU/FIXED enterprise contracts are not seat-based and should not call syncSeatCount.
 */
export async function isSeatBasedMetronomeContract({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
}): Promise<Result<boolean, Error>> {
  const aliasesResult = await getMetronomeContractPackageAliases({
    metronomeCustomerId,
    metronomeContractId,
  });

  if (aliasesResult.isErr()) {
    return new Err(aliasesResult.error);
  }

  return new Ok(aliasesResult.value.some(isSeatBasedMetronomePackageAlias));
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
  const subscriptionId = await getSeatSubscriptionId(workspace.sId);
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
