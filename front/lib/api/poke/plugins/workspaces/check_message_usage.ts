import { getMessageUsageCount } from "@app/lib/api/assistant/rate_limits";
import { createPlugin } from "@app/lib/api/poke/types";
import { Err, Ok } from "@app/types/shared/result";

export const checkMessageUsagePlugin = createPlugin({
  manifest: {
    id: "check-message-usage",
    name: "Check Message Usage",
    description: "Returns the current message usage count and the limit.",
    resourceTypes: ["workspaces"],
    args: {},
  },
  execute: async (auth, workspace) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const { count, limit } = await getMessageUsageCount(auth);

    const limitText = limit === -1 ? "unlimited" : limit.toString();

    return new Ok({
      display: "text",
      value: `Message usage: ${count} / ${limitText}`,
    });
  },
});
