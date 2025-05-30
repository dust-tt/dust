import { createPlugin } from "@app/lib/api/poke/types";
import { checkSeatCountForWorkspace } from "@app/lib/api/workspace";
import { launchUpdateUsageWorkflow } from "@app/temporal/usage_queue/client";
import { Ok } from "@app/types";

export const checkSeatCountPlugin = createPlugin({
  manifest: {
    id: "check-seat-count",
    name: "Check the seat count",
    description: "Check the seat count on Stripe.",
    resourceTypes: ["workspaces"],
    args: {
      updateQuantity: {
        type: "boolean",
        label: "Update quantity in Stripe",
        description: "Update the quantity in Stripe (to use with caution!).",
      },
    },
  },
  execute: async (auth, _, { updateQuantity }) => {
    const workspace = auth.getNonNullableWorkspace();

    if (updateQuantity) {
      const result = await launchUpdateUsageWorkflow({
        workspaceId: workspace.sId,
      });
      if (result.isErr()) {
        return result;
      }
      return new Ok({
        display: "text",
        value: "Usage report workflow launched.",
      });
    } else {
      const res = await checkSeatCountForWorkspace(workspace);
      if (res.isErr()) {
        return res;
      }

      return new Ok({
        display: "text",
        value: res.value,
      });
    }
  },
});
