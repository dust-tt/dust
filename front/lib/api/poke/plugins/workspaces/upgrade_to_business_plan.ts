import { createPlugin } from "@app/lib/api/poke/types";
import { upgradeWorkspaceToBusinessPlan } from "@app/lib/api/workspace";
import { Err, Ok } from "@app/types";

export const upgradeToBusinessPlan = createPlugin({
  manifest: {
    id: "upgrade-to-business-plan",
    name: "Whitelist workspace for Enterprise seat based plan",
    description:
      "Workspace will be able to subscribe to Enterprise seat based plan (45€/$/£) when doing their Stripe checkout session.",
    resourceTypes: ["workspaces"],
    args: {
      confirm: {
        type: "boolean",
        label: "Confirm",
        description: "Confirm whitelisting for Enterprise seat based plan.",
      },
    },
  },
  execute: async (auth, _, args) => {
    if (!args.confirm) {
      return new Err(
        new Error(
          "Please confirm the whitelisting for Enterprise seat based plan."
        )
      );
    }

    const workspace = auth.getNonNullableWorkspace();
    const res = await upgradeWorkspaceToBusinessPlan(auth, workspace);
    if (res.isErr()) {
      return res;
    }

    return new Ok({
      display: "text",
      value: `Workspace ${workspace.name} whitelisted for Enterprise seat based plan.`,
    });
  },
});
