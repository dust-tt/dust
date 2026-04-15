import { createPlugin } from "@app/lib/api/poke/types";
import { addStripeMetronomeBillingConfig } from "@app/lib/metronome/client";
import {
  cancelSubscriptionAtPeriodEnd,
  getStripeSubscription,
} from "@app/lib/plans/stripe";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { Err, Ok } from "@app/types/shared/result";

export const switchToMetronomeBillingPlugin = createPlugin({
  manifest: {
    id: "switch-to-metronome-billing",
    name: "Switch to Metronome Billing",
    description:
      "Cancels the Stripe subscription at period end and enables Metronome as the billing provider. The Metronome contract transitions at the same date to avoid double-billing.",
    resourceTypes: ["workspaces"],
    args: {},
  },
  execute: async (auth) => {
    const workspace = auth.getNonNullableWorkspace();
    const subscription = auth.subscription();

    if (!subscription?.metronomeContractId || !workspace.metronomeCustomerId) {
      return new Err(
        new Error("No Metronome contract found on this workspace")
      );
    }

    if (!subscription.stripeSubscriptionId) {
      return new Err(
        new Error(
          "No Stripe subscription found, workspace may already be on Metronome billing."
        )
      );
    }

    const stripeSubscription = await getStripeSubscription(
      subscription.stripeSubscriptionId
    );
    if (!stripeSubscription) {
      return new Err(new Error("Could not retrieve Stripe subscription."));
    }

    const billingConfigResult = await addStripeMetronomeBillingConfig({
      metronomeCustomerId: workspace.metronomeCustomerId,
      metronomeContractId: subscription.metronomeContractId,
    });
    if (billingConfigResult.isErr()) {
      return new Err(billingConfigResult.error);
    }

    const periodEnd = new Date(stripeSubscription.current_period_end * 1000);

    await withTransaction(async (t) => {
      const subscriptionResource =
        await SubscriptionResource.fetchActiveByWorkspaceModelId(
          workspace.id,
          t
        );
      if (!subscriptionResource) {
        throw new Error("Could not fetch active subscription resource.");
      }
      await subscriptionResource.markAsEnded("ended_backend_only", t);
      await SubscriptionResource.makeNew(
        {
          sId: generateRandomModelSId(),
          workspaceId: workspace.id,
          planId: subscriptionResource.planId,
          status: "active",
          trialing: false,
          startDate: periodEnd,
          endDate: null,
          stripeSubscriptionId: null,
          metronomeContractId: subscription.metronomeContractId,
        },
        subscriptionResource.getPlan(),
        t
      );
    });

    await cancelSubscriptionAtPeriodEnd({
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    });

    return new Ok({
      display: "text",
      value:
        `Stripe subscription ${subscription.stripeSubscriptionId} will be cancelled on ${periodEnd.toISOString()}. ` +
        `New Metronome contract ${subscription.metronomeContractId} continues from that date with Stripe as billing provider.`,
    });
  },
});
