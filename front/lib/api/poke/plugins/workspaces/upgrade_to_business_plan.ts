import { createPlugin } from "@app/lib/api/poke/types";
import { upgradeWorkspaceToBusinessPlan } from "@app/lib/api/workspace";
import { Err, Ok } from "@app/types";

export const upgradeToBusinessPlan = createPlugin({
  manifest: {
    id: "upgrade-to-business-plan",
    name: "Upgrade to Business Plan",
    description: "Upgrade workspace to business plan (Pro plan 39€).",
    resourceTypes: ["workspaces"],
    args: {
      confirm: {
        type: "boolean",
        label: "Confirm",
        description: "Confirm updating to business plan.",
      },
    },
  },
  execute: async (auth, _, args) => {
    if (!args.confirm) {
      return new Err(new Error("Please confirm the upgrade to business plan."));
    }

    const workspace = auth.getNonNullableWorkspace();
    const res = await upgradeWorkspaceToBusinessPlan(auth, workspace);
    if (res.isErr()) {
      return res;
    }

    return new Ok({
      display: "text",
      value: `Workspace ${workspace.name} upgrade to business plan.`,
    });
  },
});
