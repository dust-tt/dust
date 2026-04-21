import { createPlugin } from "@app/lib/api/poke/types";
import type { Authenticator } from "@app/lib/auth";
import { addStripeMetronomeBillingConfig } from "@app/lib/metronome/client";
import {
  cancelSubscriptionImmediatelyNoInvoice,
  getStripeSubscription,
} from "@app/lib/plans/stripe";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

async function switchWorkspaceToMetronomeBilling(
  auth: Authenticator
): Promise<Result<{ display: "text"; value: string }, Error>> {
  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();

  if (!subscription?.metronomeContractId || !workspace.metronomeCustomerId) {
    return new Err(new Error("No Metronome contract found on this workspace"));
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

  await withTransaction(async (t) => {
    const subscriptionResource =
      await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id, t);
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
        startDate: new Date(),
        endDate: null,
        stripeSubscriptionId: null,
        metronomeContractId: subscription.metronomeContractId,
      },
      subscriptionResource.getPlan(),
      t
    );
  });

  try {
    await cancelSubscriptionImmediatelyNoInvoice({
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    });
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      {
        error,
        workspaceSId: workspace.sId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
      "[SwitchToMetronomeBilling] MANUAL ACTION REQUIRED: DB and Metronome are already migrated " +
        "to Metronome billing but Stripe subscription cancellation failed. " +
        "Cancel the Stripe subscription manually (with invoice_now=false, prorate=false) to avoid extra invoicing."
    );
    return new Ok({
      display: "text",
      value:
        `WARNING: DB migrated and Metronome billing enabled, but failed to cancel Stripe ` +
        `subscription ${subscription.stripeSubscriptionId}: ${error.message}. ` +
        `Cancel the Stripe subscription manually (with invoice_now=false, prorate=false) to avoid extra invoicing.`,
    });
  }

  return new Ok({
    display: "text",
    value:
      `Stripe subscription ${subscription.stripeSubscriptionId} cancelled immediately (no proration invoice). ` +
      `New Metronome contract ${subscription.metronomeContractId} is now the active billing provider.`,
  });
}

export const switchToMetronomeBillingPlugin = createPlugin({
  manifest: {
    id: "switch-to-metronome-billing",
    name: "Switch to Metronome Billing",
    description:
      "Cancels the Stripe subscription immediately (no proration invoice) and enables Metronome as the billing provider.",
    resourceTypes: ["workspaces"],
    args: {},
  },
  execute: async (auth) => {
    return switchWorkspaceToMetronomeBilling(auth);
  },
});
