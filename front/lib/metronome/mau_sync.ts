import {
  getMetronomeClient,
  updateSubscriptionQuantity,
} from "@app/lib/metronome/client";
import {
  getProductWorkspaceMau1Id,
  getProductWorkspaceMau5Id,
  getProductWorkspaceMau10Id,
} from "@app/lib/metronome/constants";
import { countActiveUsersForPeriodInWorkspace } from "@app/lib/plans/usage/mau";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Retrieve a contract and extract MAU subscription ID + threshold in one call.
 */
async function getContractMauInfo(
  metronomeCustomerId: string,
  contractId: string
): Promise<{ subscriptionId: string; threshold: number } | undefined> {
  const client = getMetronomeClient();

  const response = await client.v2.contracts.retrieve({
    customer_id: metronomeCustomerId,
    contract_id: contractId,
  });
  const contract = response.data;
  if (!contract?.subscriptions?.length) {
    return undefined;
  }

  // Determine threshold from which MAU billing product is on the contract.
  const productIds = new Set(
    contract.subscriptions.map(
      (s: { subscription_rate: { product: { id: string } } }) =>
        s.subscription_rate.product.id
    )
  );

  let threshold = 1;
  let mauProductId = getProductWorkspaceMau1Id();
  if (productIds.has(getProductWorkspaceMau10Id())) {
    threshold = 10;
    mauProductId = getProductWorkspaceMau10Id();
  } else if (productIds.has(getProductWorkspaceMau5Id())) {
    threshold = 5;
    mauProductId = getProductWorkspaceMau5Id();
  }

  // Find the MAU subscription matching the threshold product.
  const mauSub = contract.subscriptions.find(
    (s: { subscription_rate: { product: { id: string } } }) =>
      s.subscription_rate.product.id === mauProductId
  );
  if (!mauSub?.id) {
    return undefined;
  }

  return { subscriptionId: mauSub.id, threshold };
}

/**
 * Sync the Metronome Workspace MAU subscription quantity to the current MAU count.
 * The MAU threshold (1, 5, or 10 messages/month) is determined from the contract's
 * billing product. Defaults to MAU_1 if no billing product is found.
 *
 * Called from:
 * - contract provisioning after creation or migration
 * - contract package switching
 * - daily Temporal schedule
 */
export async function syncMauCount({
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
  const mauInfo = await getContractMauInfo(metronomeCustomerId, contractId);
  if (!mauInfo) {
    logger.warn(
      { workspaceId: workspace.sId, contractId },
      "[Metronome] No MAU subscription found on contract — cannot sync MAU"
    );
    return new Err(new Error("No MAU subscription found on contract"));
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const mauCount = await countActiveUsersForPeriodInWorkspace({
    messagesPerMonthForMau: mauInfo.threshold,
    since: thirtyDaysAgo,
    workspace,
  });

  return await updateSubscriptionQuantity({
    metronomeCustomerId,
    contractId,
    subscriptionId: mauInfo.subscriptionId,
    quantity: Math.max(mauCount, 1),
    startingAt,
  });
}
