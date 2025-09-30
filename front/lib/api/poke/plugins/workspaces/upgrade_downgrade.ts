import { createPlugin } from "@app/lib/api/poke/types";
import { Err } from "@app/types";

// The following plugins are no-op plugins for the upgrade and downgrade endpoints.
// They are used to save a plugin record in the database for the upgrade and downgrade endpoints.

export const upgradeEnterprisePlan = createPlugin({
  manifest: {
    id: "upgrade-enterprise-plan",
    name: "Upgrade Enterprise Plan",
    description: "Upgrade enterprise plan",
    resourceTypes: ["workspaces"],
    isHidden: true,
    args: {
      planCode: {
        type: "text",
        label: "Plan Code",
        description: "The plan code to upgrade to",
        placeholder: "e.g., FREE_UPGRADED_PLAN",
        required: true,
      },
      stripeSubscriptionId: {
        type: "text",
        label: "Stripe Subscription ID",
        description: "The stripe subscription id to upgrade to",
        placeholder: "e.g., sub_1234567890",
        required: true,
      },
    },
  },
  execute: async () => {
    return new Err(new Error("NO_OP"));
  },
});

export const upgradeFreePlan = createPlugin({
  manifest: {
    id: "upgrade-free-plan",
    name: "Upgrade Free Plan",
    description: "Upgrade free plan",
    resourceTypes: ["workspaces"],
    isHidden: true,
    args: {
      planCode: {
        type: "text",
        label: "Plan Code",
        description: "The plan code to upgrade to",
        placeholder: "e.g., FREE_UPGRADED_PLAN",
        required: true,
      },
      endDate: {
        type: "text",
        label: "End Date",
        description: "Optional end date for the upgrade",
        placeholder: "YYYY-MM-DD",
        required: false,
      },
    },
  },
  execute: async () => {
    return new Err(new Error("NO_OP"));
  },
});

export const downgradeNoPlan = createPlugin({
  manifest: {
    id: "downgrade-no-plan",
    name: "Downgrade No Plan",
    description: "Downgrade no plan",
    resourceTypes: ["workspaces"],
    isHidden: true,
    args: {},
  },
  execute: async () => {
    return new Err(new Error("NO_OP"));
  },
});
