import { Ok } from "@dust-tt/types";

import { createPlugin } from "@app/lib/api/poke/types";
import { checkSeatCountForWorkspace } from "@app/lib/api/workspace";

export const checkSeatCount = createPlugin(
  {
    id: "check-seat-count",
    name: "Check the seat count",
    description: "Check the seat count between Stripe and Dust.",
    resourceTypes: ["workspaces"],
    args: {
      updateQuantity: {
        type: "boolean",
        label: "Update quantity in Stripe",
        description: "Update the quantity in Stripe (to use with caution!).",
      },
    },
  },
  async (auth, resourceId, args) => {
    const workspace = auth.getNonNullableWorkspace();
    const res = await checkSeatCountForWorkspace(
      auth,
      workspace,
      args.updateQuantity
    );
    if (res.isErr()) {
      return res;
    }

    return new Ok({
      display: "text",
      value: res.value,
    });
  }
);
