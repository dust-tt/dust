import type Stripe from "stripe";

import { createPlugin } from "@app/lib/api/poke/types";
import {
  getRemainingCredits,
  resetCredits,
} from "@app/lib/api/public_api_limits";
import {
  getWorkspacePublicAPILimits,
  setWorkspacePublicAPILimits,
} from "@app/lib/api/workspace";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import type { LightWorkspaceType } from "@app/types";
import { Err, Ok } from "@app/types";

/**
 * Calculates the billing day of the month based on the Stripe subscription's
 * current period start. This is used to determine when the monthly API limits
 * should reset.
 *
 * @param stripeSubscription - The Stripe subscription object containing billing
 * information
 * @returns The day of the month (1-31) when billing occurs
 */
function calculateBillingDay(stripeSubscription: Stripe.Subscription): number {
  const billingPeriodStart = stripeSubscription.current_period_start;
  return new Date(billingPeriodStart * 1000).getUTCDate();
}

/**
 * Adjusts the remaining credits for a workspace when the monthly limit changes.
 * This function handles both increasing and decreasing the limit:
 * - If the new limit is higher, adds the difference to remaining credits
 * - If the new limit is lower, subtracts the difference from remaining credits
 *
 * @param workspace - The workspace to adjust credits for
 * @param monthlyLimit - The new monthly limit to set
 */
async function adjustCredits(
  workspace: LightWorkspaceType,
  { newMonthlyLimit }: { newMonthlyLimit: number }
): Promise<void> {
  const previousLimits = getWorkspacePublicAPILimits(workspace);
  if (!previousLimits?.enabled) {
    return;
  }

  const limitDelta = newMonthlyLimit - previousLimits.monthlyLimit;
  if (limitDelta === 0) {
    return;
  }

  const remainingCredits = await getRemainingCredits(workspace);
  // If key is not set, credits will be set on the next token usage.
  if (remainingCredits === null) {
    return;
  }

  const newCredits = remainingCredits + limitDelta;
  await resetCredits(workspace, { newCredits });
}

export const setPublicAPILimitsPlugin = createPlugin({
  manifest: {
    id: "set-public-api-limits",
    name: "Set Public API Limits",
    description:
      "Configure monthly spending limits for a workspace's public API usage. This helps control" +
      " costs and prevent unexpected charges.",
    resourceTypes: ["workspaces"],
    args: {
      enabled: {
        type: "boolean",
        label: "Enabled",
        description:
          "Enable or disable public API limits. When disabled, there " +
          "are no spending restrictions. (Leave empty to disable).",
      },
      monthlyLimit: {
        type: "number",
        label: "Monthly Limit (USD)",
        description:
          "Maximum amount that can be spent on API usage per month. " +
          "When reached, API calls will be blocked until the next billing cycle.",
      },
    },
  },
  execute: async (auth, _, args) => {
    const { enabled, monthlyLimit } = args;
    const workspace = auth.getNonNullableWorkspace();
    const subscription = auth.subscription();

    // Validate subscription requirements.
    if (!subscription) {
      return new Err(
        new Error(
          `Workspace "${workspace.name}" cannot set API limits: No subscription ` +
            `found. Please ensure the workspace has an active subscription.`
        )
      );
    }

    if (!subscription.stripeSubscriptionId) {
      return new Err(
        new Error(
          `Workspace "${workspace.name}" cannot set API limits: No Stripe ` +
            `subscription found. Please ensure the workspace has a valid Stripe ` +
            `subscription.`
        )
      );
    }

    const stripeSubscription = await getStripeSubscription(
      subscription.stripeSubscriptionId
    );
    if (!stripeSubscription) {
      return new Err(
        new Error(
          `Workspace "${workspace.name}" cannot set API limits: Invalid Stripe ` +
            `subscription. Please contact support if this issue persists.`
        )
      );
    }

    // Handle disabling limits.
    if (!enabled) {
      const res = await setWorkspacePublicAPILimits(workspace, {
        enabled: false,
      });
      if (res.isErr()) {
        return res;
      }

      // Reset credits.
      await resetCredits(workspace);

      return new Ok({
        display: "json",
        value: {
          status: "success",
          message: `API limits disabled for workspace "${workspace.name}".`,
          enabled: false,
        },
      });
    }

    // Adjust credits based on new limit.
    await adjustCredits(workspace, { newMonthlyLimit: monthlyLimit });

    // Set new limits.
    const billingDay = calculateBillingDay(stripeSubscription);
    const res = await setWorkspacePublicAPILimits(workspace, {
      enabled,
      monthlyLimit,
      billingDay,
    });
    if (res.isErr()) {
      return res;
    }

    return new Ok({
      display: "json",
      value: {
        status: "success",
        message: `API limits configured for workspace "${workspace.name}".`,
        enabled,
        monthlyLimit,
        billingDay,
        billingDayExplanation: `Limits will reset on the ${billingDay} of each month.`,
      },
    });
  },
});
