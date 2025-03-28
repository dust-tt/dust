import { resetMessageRateLimitForWorkspace } from "@app/lib/api/assistant/rate_limits";
import { createPlugin } from "@app/lib/api/poke/types";
import { Err, Ok } from "@app/types";

export const resetMessageRateLimitPlugin = createPlugin({
  manifest: {
    id: "reset-message-rate-limit",
    name: "Reset Message Rate Limit",
    description: "Reset the message rate limit for the workspace.",
    resourceTypes: ["workspaces"],
    args: {
      confirmReset: {
        type: "boolean",
        label: "Confirm Reset",
        description: "Confirm you want to reset the message rate limit",
      },
    },
  },
  execute: async (auth, resource, args) => {
    const subscription = auth.subscription();
    const plan = auth.plan();

    if (!subscription || !plan) {
      return new Err(new Error("The workspace does not have a subscription."));
    }

    if (!args.confirmReset) {
      return new Err(new Error("Rate limit reset not confirmed."));
    }

    await resetMessageRateLimitForWorkspace(auth);

    return new Ok({
      display: "text",
      value: `Message rate limit reset for workspace ${resource?.sId}.`,
    });
  },
});
