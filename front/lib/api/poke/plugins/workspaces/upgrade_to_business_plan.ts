import { createPlugin } from "@app/lib/api/poke/types";
import { setWorkspaceBusinessPlanWhitelist } from "@app/lib/api/workspace";
import { Ok } from "@app/types";

export const toggleBusinessPlanWhitelist = createPlugin({
  manifest: {
    id: "toggle-business-plan-whitelist",
    name: "Toggle Enterprise seat based plan whitelist",
    description:
      "Toggle workspace whitelisting for Enterprise seat based plan (45€/$/£). The toggle shows the current state.",
    resourceTypes: ["workspaces"],
    args: {
      shouldWhitelist: {
        type: "boolean",
        label: "Whitelist for Enterprise seat based plan",
        description: "Check to enable whitelisting, uncheck to disable.",
        variant: "toggle",
        async: true,
      },
    },
  },
  populateAsyncArgs: async (auth) => {
    const workspace = auth.getNonNullableWorkspace();
    const isCurrentlyWhitelisted = workspace.metadata?.isBusiness === true;

    return new Ok({
      shouldWhitelist: isCurrentlyWhitelisted,
    });
  },
  execute: async (auth, _, args) => {
    const workspace = auth.getNonNullableWorkspace();
    const shouldBeWhitelisted = args.shouldWhitelist;

    const res = await setWorkspaceBusinessPlanWhitelist(
      auth,
      workspace,
      shouldBeWhitelisted
    );

    if (res.isErr()) {
      return res;
    }

    return new Ok({
      display: "text",
      value: `Workspace ${workspace.name} ${shouldBeWhitelisted ? "whitelisted for" : "whitelist removed for"} Enterprise seat based plan.`,
    });
  },
});
