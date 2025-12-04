import { addYears, format } from "date-fns";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

import { createPlugin } from "@app/lib/api/poke/types";
import { createEnterpriseCreditPurchase } from "@app/lib/credits/committed";
import {
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
  startDate: z.date(),
  expirationDate: z.date(),
  overrideDiscount: z.boolean(),
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
    name: "Buy Committed Credits",
    description:
      "Purchase committed credits for enterprise customers. Committed credits are consumed after free credits and before pay-as-you-go (PAYG) credits. An invoice will be sent to the customer.",
    resourceTypes: ["workspaces"],
    args: {
      amountDollars: {
        type: "number",
        label: "Credit Amount (US$)",
        description:
          "Committed credits amount in USD. Note: this is different from billed amount, as it  excludes VAT, currency conversion and discounts",
      },
      overrideDiscount: {
        type: "boolean",
        variant: "toggle",
        label: "Override Default Discount",
        async: true,
        asyncDescription: true,
      },
      discountPercent: {
        type: "number",
        async: true,
        label: "Billing Discount (%)",
        description: "Discount applied to the actual credit purchase",
        dependsOn: { field: "overrideDiscount", value: true },
      },
      startDate: {
        type: "date",
        async: true,
        label: "Start Date",
        description: "When the credits become active.",
      },
      expirationDate: {
        type: "date",
        async: true,
        label: "Expiration Date",
        description: "When the credits expire.",
      },
      confirm: {
        type: "boolean",
        label: "Confirm Purchase",
        description:
          "I understand that running this plugin will add committed credits and an invoice will be sent to the customer.",
      },
    },
  },
  populateAsyncArgs: async (auth) => {
    const config =
      await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
    const defaultDiscount = config?.defaultDiscountPercent ?? 0;
    const workspace = auth.getNonNullableWorkspace();

    const overrideDiscountDescription = `Override the customer's default discount. Current default for ${workspace.name}: ${defaultDiscount}%`;

    const today = new Date();
    const oneYearFromNow = addYears(today, 1);

    return new Ok({
      overrideDiscountDescription: overrideDiscountDescription,
      startDate: format(today, "yyyy-MM-dd"),
      expirationDate: format(oneYearFromNow, "yyyy-MM-dd"),
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

    const amountMicroUsd = Math.round(validatedArgs.amountDollars * 1_000_000);

    const startDate = new Date(validatedArgs.startDate);
    const expirationDate = new Date(validatedArgs.expirationDate);

    if (expirationDate <= startDate) {
      return new Err(new Error("Expiration date must be after start date."));
    }

    let discountPercent: number | undefined;
    if (validatedArgs.overrideDiscount) {
      discountPercent =
        validatedArgs.discountPercent > 0
          ? validatedArgs.discountPercent
          : undefined;
    } else {
      const config =
        await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
      const defaultDiscount = config?.defaultDiscountPercent ?? 0;
      discountPercent = defaultDiscount > 0 ? defaultDiscount : undefined;
    }

    const result = await createEnterpriseCreditPurchase({
      auth,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      amountMicroUsd,
      discountPercent,
      startDate,
      expirationDate,
    });

    if (result.isErr()) {
      return result;
    }

    const invoiceUrl = `https://dashboard.stripe.com/invoices/${result.value.invoiceOrLineItemId}`;

    const originalAmount = validatedArgs.amountDollars;

    return new Ok({
      display: "textWithLink",
      value: `Successfully added committed credits of $${originalAmount.toFixed(2)} (${validatedArgs.startDate} to ${validatedArgs.expirationDate}). An invoice has been sent to the customer.`,
      link: invoiceUrl,
      linkText: "View Invoice in Stripe",
    });
  },
});
