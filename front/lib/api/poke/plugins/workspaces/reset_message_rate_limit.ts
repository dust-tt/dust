import { Err, Ok } from "@dust-tt/types";

import { resetMessageRateLimitForWorkspace } from "@app/lib/api/assistant/rate_limits";
import { createPlugin } from "@app/lib/api/poke/types";

export const resetMessageRateLimit = createPlugin(
  {
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
  async (auth, resourceId, args) => {
    const subscription = auth.subscription();
    const plan = auth.plan();

    if (!subscription || !plan) {
      return new Err(new Error("The workspace does not have a subscription."));
    }

    if (!args.confirmReset) {
      return new Err(new Error("Rate limit reset not confirmed."));
    }

    await resetMessageRateLimitForWorkspace(auth);

    return new Ok(`Message rate limit reset for workspace ${resourceId}`);
  }
);
