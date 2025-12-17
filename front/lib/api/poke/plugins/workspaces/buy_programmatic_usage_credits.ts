import { addYears, format } from "date-fns";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

import { MAX_DISCOUNT_PERCENT } from "@app/lib/api/assistant/token_pricing";
import { createPlugin } from "@app/lib/api/poke/types";
import { createEnterpriseCreditPurchase } from "@app/lib/credits/committed";
import {
  getStripeSubscription,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { Err, Ok } from "@app/types";

const BuyCreditPurchaseArgsSchema = z
  .object({
    amountDollars: z
      .number()
      .positive("Amount must be greater than $0")
      .finite("Amount must be a valid number"),
    startDate: z.coerce.date(),
    expirationDate: z.coerce.date(),
    isFreeCredit: z.boolean(),
    overrideDiscount: z.boolean(),
    discountPercent: z
      .number()
      .min(0, "Discount must be at least 0%")
      .max(
        MAX_DISCOUNT_PERCENT,
        `Discount cannot exceed ${MAX_DISCOUNT_PERCENT}% (would result in selling below cost)`
      )
      .finite("Discount must be a valid number"),
    confirm: z.boolean(),
    confirmFreeCredit: z.boolean(),
  })
  .refine(
    (data) => {
      if (data.isFreeCredit) {
        return data.confirmFreeCredit === true;
      }
      return data.confirm === true;
    },
    {
      message: "Please confirm the purchase by checking the confirmation box",
    }
  );

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
        variant: "input",
        label: "Credit Amount (US$)",
        description:
          "Committed credits amount in USD. Note: this is different from billed amount, as it  excludes VAT, currency conversion and discounts",
      },
      isFreeCredit: {
        type: "boolean",
        variant: "toggle",
        label: "Free Credit (no invoice)",
        description:
          "Create a free credit instead of a committed credit. No invoice will be sent.",
      },
      overrideDiscount: {
        type: "boolean",
        variant: "toggle",
        label: "Override Default Discount",
        async: true,
        asyncDescription: true,
        dependsOn: { field: "isFreeCredit", value: false },
      },
      discountPercent: {
        type: "number",
        variant: "input",
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
        dependsOn: { field: "isFreeCredit", value: false },
      },
      confirmFreeCredit: {
        type: "boolean",
        label: "Confirm FREE Credit (⚠️ Giving money!)",
        description:
          "I understand that this will create FREE credits without an invoice. This is giving money to the customer for free.",
        dependsOn: { field: "isFreeCredit", value: true },
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

    const amountMicroUsd = Math.round(validatedArgs.amountDollars * 1_000_000);
    const startDate = new Date(validatedArgs.startDate);
    const expirationDate = new Date(validatedArgs.expirationDate);

    if (expirationDate <= startDate) {
      return new Err(new Error("Expiration date must be after start date."));
    }

    const originalAmount = validatedArgs.amountDollars;

    // Handle free credit creation (no Stripe invoice).
    if (validatedArgs.isFreeCredit) {
      const idempotencyKey = `free-poke-${workspace.sId}-${Date.now()}`;

      const credit = await CreditResource.makeNew(auth, {
        type: "free",
        initialAmountMicroUsd: amountMicroUsd,
        consumedAmountMicroUsd: 0,
        discount: null,
        invoiceOrLineItemId: idempotencyKey,
      });

      const startResult = await credit.start(auth, {
        startDate,
        expirationDate,
      });
      if (startResult.isErr()) {
        return new Err(startResult.error);
      }

      return new Ok({
        display: "text",
        value: `Successfully added FREE credits of $${originalAmount.toFixed(2)} (${format(validatedArgs.startDate, "yyyy-MM-dd")} to ${format(validatedArgs.expirationDate, "yyyy-MM-dd")}). No invoice was sent.`,
      });
    }

    // Handle committed credit creation (with Stripe invoice).
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

    return new Ok({
      display: "textWithLink",
      value: `Successfully added committed credits of $${originalAmount.toFixed(2)} (${format(validatedArgs.startDate, "yyyy-MM-dd")} to ${format(validatedArgs.expirationDate, "yyyy-MM-dd")}). An invoice has been sent to the customer.`,
      link: invoiceUrl,
      linkText: "View Invoice in Stripe",
    });
  },
});
