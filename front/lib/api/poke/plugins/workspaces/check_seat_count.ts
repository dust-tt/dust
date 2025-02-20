import { Err, Ok } from "@dust-tt/types";

import { createPlugin } from "@app/lib/api/poke/types";
import { checkSeatCountForWorkspace } from "@app/lib/api/workspace";
import { isSeatBased } from "@app/lib/plans/plan_codes";
import { launchUpdateUsageWorkflow } from "@app/temporal/usage_queue/client";

export const checkSeatCount = createPlugin(
  {
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
  async (auth, resourceId, { updateQuantity }) => {
    const workspace = auth.getNonNullableWorkspace();

    if (updateQuantity) {
      const plan = auth.subscription()?.plan;
      if (plan && isSeatBased(plan)) {
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
      }
      return new Err(new Error("Plan does not enforce seat-based billing."));
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
  }
);
