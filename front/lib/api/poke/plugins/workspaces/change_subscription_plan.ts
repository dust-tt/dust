import { createPlugin } from "@app/lib/api/poke/types";
import { PlanModel } from "@app/lib/models/plan";
import { isCreditPricedPlanPrefix } from "@app/lib/plans/plan_codes";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

const ChangeSubscriptionPlanArgsSchema = z
  .object({
    planCode: z.array(z.string()).length(1, "Please select a plan"),
    confirm: z.boolean(),
  })
  .refine((data) => data.confirm === true, {
    message: "Please confirm before changing the plan",
  });

// Narrows the selectable plans to those that match the workspace's current
// billing setup:
// - Metronome-billed (has a contract): only credit-priced (CP_) plans.
// - Stripe-billed (no contract): the legacy, non credit-priced plans.
// - No billing (no contract, no Stripe): only FREE plans.
function allowedPlanFilter(
  subscription: SubscriptionResource | null
): (planCode: string) => boolean {
  if (subscription?.metronomeContractId) {
    return isCreditPricedPlanPrefix;
  }
  if (subscription?.stripeSubscriptionId) {
    return (planCode) => !isCreditPricedPlanPrefix(planCode);
  }
  return (planCode) => planCode.startsWith("FREE_");
}

export const changeSubscriptionPlanPlugin = createPlugin({
  manifest: {
    id: "change-subscription-plan",
    name: "Change Subscription Plan",
    description:
      "Repoint this workspace's active subscription to a different plan. " +
      "Updates the subscription row, mirrors the plan code onto the Metronome " +
      "contract when the workspace is Metronome-billed, and flushes the caches. " +
      "The plan list is narrowed to match the workspace's billing setup: " +
      "credit-priced (CP_) plans for Metronome contracts, legacy plans for " +
      "Stripe subscriptions, and FREE plans when there is no billing.",
    explanation:
      "This is a low-level override: it does NOT create or end a subscription, " +
      "touch Stripe, adjust seats/credits, or run the usual upgrade/downgrade " +
      "guardrails. Use it to fix up which plan an existing subscription points " +
      "to, not to move a customer between billing tiers.",
    warning:
      "Only changes the plan the active subscription references and the " +
      "Metronome plan-code custom field. It does not reconcile billing.",
    resourceTypes: ["workspaces"],
    args: {
      planCode: {
        type: "enum",
        label: "Plan",
        description: "The plan to switch the subscription to.",
        async: true,
        values: [],
        multiple: false,
      },
      confirm: {
        type: "boolean",
        label: "Confirm",
        description: "I confirm I want to change this workspace's plan.",
      },
    },
    requiredRoles: ["billing"],
  },
  populateAsyncArgs: async (auth) => {
    const subscription = auth.subscriptionResource();
    const currentPlanCode = subscription?.getPlan().code;
    const isAllowed = allowedPlanFilter(subscription);

    const plans = await PlanModel.findAll({ order: [["name", "ASC"]] });
    return new Ok({
      planCode: plans
        .filter((plan) => isAllowed(plan.code))
        .map((plan) => ({
          label: `${plan.name} (${plan.code})`,
          value: plan.code,
          checked: plan.code === currentPlanCode,
        })),
    });
  },
  execute: async (auth, _, args) => {
    const validationResult = ChangeSubscriptionPlanArgsSchema.safeParse(args);
    if (!validationResult.success) {
      return new Err(new Error(fromZodError(validationResult.error).message));
    }

    const planCode = validationResult.data.planCode[0];

    const res = await SubscriptionResource.pokeChangePlan({ auth, planCode });
    if (res.isErr()) {
      return res;
    }

    const { previousPlanCode, metronomeContractUpdated } = res.value;

    return new Ok({
      display: "text",
      value:
        `Plan changed from "${previousPlanCode}" to "${planCode}".\n` +
        `Metronome contract updated: ${metronomeContractUpdated ? "yes" : "no (not Metronome-billed)"}.`,
    });
  },
});
