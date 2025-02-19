import { Err, Ok } from "@dust-tt/types";

import { createPlugin } from "@app/lib/api/poke/types";
import { upgradeWorkspaceToBusinessPlan } from "@app/lib/api/workspace";

export const upgradeToBusinessPlan = createPlugin(
  {
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
  async (auth, resourceId, args) => {
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
  }
);
