/**
 * Debug helper: dump the raw Metronome seat/quantity state for a workspace's
 * SEAT_BASED subscriptions, so we can see which field actually holds the live
 * total (assigned + unassigned) seat count.
 *
 * For each subscription on the active contract it prints:
 *  - quantity_management_mode + the contract's `quantity_schedule`
 *  - the raw `retrieveSubscriptionQuantityHistory` response
 *  - the raw `getSubscriptionSeatsHistory` response (assigned_seat_ids + any
 *    unassigned field the endpoint returns)
 *
 * Run with:
 *   npx tsx scripts/debug_metronome_seat_state.ts --workspaceId <sId>
 */

import {
  getMetronomeClient,
  getMetronomeContractById,
} from "@app/lib/metronome/client";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";

import { makeScript } from "./helpers";

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      description: "Workspace sId",
    },
  },
  async ({ workspaceId }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace?.metronomeCustomerId) {
      logger.error({ workspaceId }, "No workspace / metronomeCustomerId");
      return;
    }
    const metronomeCustomerId = workspace.metronomeCustomerId;

    const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
      workspace.id
    );
    if (!subscription?.metronomeContractId) {
      logger.error({ workspaceId }, "No active metronomeContractId");
      return;
    }
    const contractId = subscription.metronomeContractId;

    const contractResult = await getMetronomeContractById({
      metronomeCustomerId,
      metronomeContractId: contractId,
    });
    if (contractResult.isErr()) {
      logger.error({ error: contractResult.error }, "Failed to fetch contract");
      return;
    }
    const subscriptions = contractResult.value.subscriptions ?? [];

    const client = getMetronomeClient();

    for (const sub of subscriptions) {
      if (!sub.id) {
        continue;
      }

      logger.info(
        {
          subscriptionId: sub.id,
          productId: sub.subscription_rate.product.id,
          productName: sub.subscription_rate.product.name,
          quantity_management_mode: sub.quantity_management_mode,
          quantity_schedule: sub.quantity_schedule,
        },
        "[debug] contract subscription"
      );

      const quantityHistory =
        await client.v1.contracts.retrieveSubscriptionQuantityHistory({
          customer_id: metronomeCustomerId,
          contract_id: contractId,
          subscription_id: sub.id,
        });
      logger.info(
        {
          subscriptionId: sub.id,
          raw: JSON.stringify(quantityHistory),
        },
        "[debug] retrieveSubscriptionQuantityHistory"
      );

      const seatsHistory = await client.post(
        "/v1/contracts/getSubscriptionSeatsHistory",
        {
          body: {
            customer_id: metronomeCustomerId,
            contract_id: contractId,
            subscription_id: sub.id,
            covering_date: new Date().toISOString(),
          },
        }
      );
      logger.info(
        {
          subscriptionId: sub.id,
          raw: JSON.stringify(seatsHistory),
        },
        "[debug] getSubscriptionSeatsHistory"
      );
    }
  }
);
