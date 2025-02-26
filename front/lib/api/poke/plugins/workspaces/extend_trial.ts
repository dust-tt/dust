import { Err, Ok } from "@dust-tt/types";

import { createPlugin } from "@app/lib/api/poke/types";
import { extendStripeSubscriptionTrial } from "@app/lib/plans/stripe";

export const extendTrialPlugin = createPlugin({
  manifest: {
    id: "extend-trial",
    name: "Extend trial",
    description: "Extend the trial period of the workspace",
    resourceTypes: ["workspaces"],
    args: {
      days: {
        type: "number",
        label: "Days",
        description: "Number of days to extend the trial period",
      },
    },
  },
  execute: async (auth, _, args) => {
    const subscription = auth.subscription();
    if (!subscription || !subscription.stripeSubscriptionId) {
      return new Err(
        new Error("The workspace does not have a valid subscription.")
      );
    }

    if (!subscription.trialing) {
      return new Err(new Error("Workspace is not in trial period"));
    }

    const result = await extendStripeSubscriptionTrial(
      subscription.stripeSubscriptionId,
      { days: args.days }
    );
    if (result.isErr()) {
      return result;
    }

    if (!result.value.trialEnd) {
      return new Err(new Error("Failed to extend the trial"));
    }

    return new Ok({
      display: "text",
      value: `New trial end date: ${new Date(result.value.trialEnd * 1000).toLocaleDateString()}`,
    });
  },
});
