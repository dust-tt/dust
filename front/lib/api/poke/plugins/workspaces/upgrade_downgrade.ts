import { createPlugin } from "@app/lib/api/poke/types";
import { Err } from "@app/types/shared/result";

// The following plugins are no-op plugins for the upgrade and downgrade endpoints.
// They are used to save a plugin record in the database for the upgrade and downgrade endpoints.

export const upgradeEnterprisePlan = createPlugin({
  manifest: {
    id: "upgrade-enterprise-plan",
    name: "Upgrade Enterprise Plan",
    description:
      "Upgrade enterprise plan with programmatic usage configuration",
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
      freeCreditsOverrideEnabled: {
        type: "boolean",
        label: "Negotiated Free Credits",
        description: "Enable negotiated free monthly credits",
        required: true,
      },
      freeCreditsDollars: {
        type: "number",
        label: "Free Credits (USD)",
        description: "Negotiated monthly free credits amount",
        required: false,
      },
      defaultDiscountPercent: {
        type: "number",
        label: "Default Discount (%)",
        description: "Discount applied to programmatic credit purchases",
        required: false,
      },
      paygEnabled: {
        type: "boolean",
        label: "Pay-as-you-go",
        description: "Enable pay-as-you-go billing",
        required: true,
      },
      paygCapDollars: {
        type: "number",
        label: "PAYG Spending Cap (USD)",
        description: "Maximum monthly PAYG spending",
        required: false,
      },
    },
  },
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
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
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
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
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  execute: async () => {
    return new Err(new Error("NO_OP"));
  },
});
