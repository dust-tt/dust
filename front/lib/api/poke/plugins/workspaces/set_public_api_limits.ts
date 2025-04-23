import { createPlugin } from "@app/lib/api/poke/types";
import { setWorkspacePublicAPILimits } from "@app/lib/api/workspace";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { Err, Ok } from "@app/types";

export const setPublicAPILimitsPlugin = createPlugin({
  manifest: {
    id: "set-public-api-limits",
    name: "Set Public API Limits",
    description: "Set the public API limits for a workspace.",
    resourceTypes: ["workspaces"],
    args: {
      enabled: {
        type: "boolean",
        label: "Enabled",
        description: "Enable public API limits (leave empty to disable).",
      },
      monthlyLimit: {
        type: "number",
        label: "Monthly Limit Spent (in USD)",
        description: "The monthly limit for the public API.",
      },
    },
  },
  execute: async (auth, _, args) => {
    const { enabled, monthlyLimit } = args;

    const workspace = auth.getNonNullableWorkspace();
    const subscription = auth.subscription();
    if (!subscription) {
      return new Err(new Error("The workspace does not have a subscription."));
    }

    if (!subscription.stripeSubscriptionId) {
      return new Err(
        new Error("The workspace does not have a Stripe subscription.")
      );
    }

    const stripeSubscription = await getStripeSubscription(
      subscription.stripeSubscriptionId
    );
    if (!stripeSubscription) {
      return new Err(
        new Error("The workspace does not have a valid Stripe subscription.")
      );
    }

    // If the limits are disabled, disable them.
    if (!enabled) {
      const res = await setWorkspacePublicAPILimits(workspace, {
        enabled: false,
      });
      if (res.isErr()) {
        return res;
      }

      return new Ok({
        display: "text",
        value: `Workspace ${workspace.name} public API limits disabled.`,
      });
    }

    // If the limits are enabled, enable them.
    const billingPeriodStart = stripeSubscription.current_period_start;
    const billingDay = new Date(billingPeriodStart * 1000).getUTCDate();

    const res = await setWorkspacePublicAPILimits(workspace, {
      enabled,
      monthlyLimit,
      billingDay,
    });
    if (res.isErr()) {
      return res;
    }

    return new Ok({
      display: "text",
      value:
        `Workspace ${workspace.name} public API limits enabled. ` +
        `Monthly limit: ${monthlyLimit} USD. ` +
        `Billing day: ${billingDay} of the month.`,
    });
  },
});
