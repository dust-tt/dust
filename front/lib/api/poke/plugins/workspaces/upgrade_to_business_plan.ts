import { Err, Ok } from "@dust-tt/types";

import { createPlugin } from "@app/lib/api/poke/types";
import { updateWorkspaceToBusinessPlan } from "@app/lib/api/workspace";

export const updateBusinessPlan = createPlugin(
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
      return new Err(new Error("Please confirm the update to business plan."));
    }

    const workspace = auth.getNonNullableWorkspace();
    const res = await updateWorkspaceToBusinessPlan(auth, workspace);
    if (res.isErr()) {
      return res;
    }

    return new Ok({
      display: "text",
      value: `Workspace ${workspace.name} updated to business plan.`,
    });
  }
);
