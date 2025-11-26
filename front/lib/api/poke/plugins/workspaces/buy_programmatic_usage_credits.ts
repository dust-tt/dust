import { z } from "zod";
import { fromZodError } from "zod-validation-error";

import { createPlugin } from "@app/lib/api/poke/types";
import { createEnterpriseCreditPurchase } from "@app/lib/credits/committed";
import {
  getCustomerId,
  getStripeSubscription,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { Err, Ok } from "@app/types";

const BuyCreditPurchaseArgsSchema = z.object({
  amountDollars: z
    .number()
    .positive("Amount must be greater than $0")
    .finite("Amount must be a valid number"),
  discountPercent: z
    .number()
    .min(0, "Discount must be at least 0%")
    .max(100, "Discount must be at most 100%")
    .finite("Discount must be a valid number"),
  confirm: z.boolean().refine((val) => val === true, {
    message: "Please confirm the purchase by checking the confirmation box",
  }),
});

export const buyProgrammaticUsageCreditsPlugin = createPlugin({
  manifest: {
    id: "buy-programmatic-usage-credits",
    name: "Buy Programmatic Usage Credits",
    description:
      "Purchase programmatic usage credits for enterprise customers. The purchase will be added to the customer's subscription and paid on the next billing cycle.",
    resourceTypes: ["workspaces"],
    args: {
      amountDollars: {
        type: "number",
        label: "Credit Amount ($)",
        description:
          "Programmatic usage credits amount, in usd, not billed amount. So without VAT, currency conversion and discounts",
      },
      discountPercent: {
        type: "number",
        async: true,
        label: "Billing Discount (%)",
        description:
          "Discount percentage to apply (0-100) on the billed amount",
      },
      confirm: {
        type: "boolean",
        label: "Confirm Purchase",
        description:
          "I understand that running this plugin will add a purchase in the customer's subscription, which will be paid on next billing cycle",
      },
    },
  },
  populateAsyncArgs: async (auth) => {
    const config =
      await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
    const defaultDiscount = config?.defaultDiscountPercent ?? 0;

    return new Ok({
      discountPercent: defaultDiscount,
    });
  },
  execute: async (auth, _, args) => {
    const validationResult = BuyCreditPurchaseArgsSchema.safeParse(args);
    if (!validationResult.success) {
      const validationError = fromZodError(validationResult.error);
      return new Err(new Error(validationError.message));
    }

    const validatedArgs = validationResult.data;
    const workspace = auth.getNonNullableWorkspace();
    const subscription = auth.subscription();

    if (!subscription?.stripeSubscriptionId) {
      return new Err(
        new Error(
          `Workspace "${workspace.name}" does not have a Stripe subscription.`
        )
      );
    }

    const stripeSubscription = await getStripeSubscription(
      subscription.stripeSubscriptionId
    );
    if (!stripeSubscription) {
      return new Err(new Error("Failed to retrieve Stripe subscription."));
    }

    if (!isEnterpriseSubscription(stripeSubscription)) {
      return new Err(
        new Error("This plugin is only available for enterprise customers.")
      );
    }

    const amountCents = Math.round(validatedArgs.amountDollars * 100);

    const result = await createEnterpriseCreditPurchase({
      auth,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      amountCents,
      discountPercent:
        validatedArgs.discountPercent > 0
          ? validatedArgs.discountPercent
          : undefined,
    });

    if (result.isErr()) {
      return result;
    }

    const customerId = getCustomerId(stripeSubscription);
    const invoiceUrl = `https://dashboard.stripe.com/customers/${customerId}/upcoming_invoice/${subscription.stripeSubscriptionId}`;

    const originalAmount = validatedArgs.amountDollars;

    return new Ok({
      display: "textWithLink",
      value: `Successfully added credit purchase of $${originalAmount.toFixed(2)} to the subscription. The charge will appear on the next billing cycle. See upcoming invoice for actual billed amount`,
      link: invoiceUrl,
      linkText: "View Upcoming Invoice in Stripe",
    });
  },
});
