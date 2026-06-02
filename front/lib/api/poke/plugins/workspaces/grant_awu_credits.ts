import { createPlugin } from "@app/lib/api/poke/types";
import {
  computeAwuInvoiceUnitPrice,
  resolveAwuPurchaseCurrency,
  resolveAwuPurchaseDiscountPercent,
} from "@app/lib/credits/awu_pricing";
import { MAX_AWU_DISCOUNT_PERCENT } from "@app/lib/credits/awu_purchase_constants";
import { metronomeAmount } from "@app/lib/metronome/amounts";
import {
  createMetronomeCommit,
  createMetronomeCredit,
} from "@app/lib/metronome/client";
import {
  AWU_PRIORITY_PURCHASED_COMMIT,
  CURRENCY_TO_CREDIT_TYPE_ID,
  getCreditTypeAwuId,
  getProductFreeCreditId,
  getProductPrepaidCommitId,
} from "@app/lib/metronome/constants";
import logger from "@app/logger/logger";
import type { SupportedCurrency } from "@app/types/currency";
import { isCreditPricedPlan } from "@app/types/plan";
import { Err, Ok } from "@app/types/shared/result";
import { addYears, format } from "date-fns";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

const GrantAwuCreditsArgsSchema = z
  .object({
    amountCredits: z
      .number()
      .int("Amount must be a whole number of credits")
      .positive("Amount must be greater than 0")
      .finite("Amount must be a valid number"),
    isFreeCredit: z.boolean(),
    setPrice: z.boolean(),
    price: z.number().finite("Price must be a valid number").optional(),
    overrideDiscount: z.boolean(),
    discountPercent: z
      .number()
      .min(0, "Discount must be at least 0%")
      .max(
        MAX_AWU_DISCOUNT_PERCENT,
        `Discount cannot exceed ${MAX_AWU_DISCOUNT_PERCENT}%`
      )
      .finite("Discount must be a valid number"),
    startDate: z.coerce.date(),
    expirationDate: z.coerce.date(),
    purchaseOrderId: z
      .string()
      .max(140, "Purchase Order ID cannot exceed 140 characters")
      .optional(),
    confirm: z.boolean(),
  })
  .refine((data) => data.confirm === true, {
    message: "Please confirm by checking the confirmation box",
    path: ["confirm"],
  })
  .refine(
    (data) => !data.setPrice || (data.price !== undefined && data.price > 0),
    {
      message: "Price is required when 'Set Price' is enabled",
      path: ["price"],
    }
  );

export const grantAwuCreditsPlugin = createPlugin({
  manifest: {
    id: "grant-awu-credits",
    name: "Grant AWU Credits or Commits",
    description:
      "Grant Agentic Work Unit (AWU) credits to a workspace at the Metronome customer level. " +
      "Choose between free credits (no invoice, given for free) or prepaid commits (paid commit, " +
      "the customer will be invoiced).",
    resourceTypes: ["workspaces"],
    args: {
      amountCredits: {
        type: "number",
        variant: "text",
        label: "Amount (AWU credits)",
        description: "Number of AWU credits to grant.",
      },
      isFreeCredit: {
        type: "boolean",
        variant: "toggle",
        label: "Free Credit (no invoice)",
        description:
          "When enabled, grants free AWU credits. When disabled, grants a commit (the customer will be invoiced through Metronome).",
      },
      setPrice: {
        type: "boolean",
        variant: "toggle",
        label: "Set Price",
        description:
          "Enter the total invoice price and currency directly instead of computing them from AWU rates and the workspace discount. Bypasses any configured discount.",
        dependsOn: { field: "isFreeCredit", value: false },
      },
      price: {
        type: "number",
        variant: "text",
        async: true,
        asyncDescription: true,
        label: "Total invoice price",
        description:
          "Total invoice amount in the customer's billing currency (e.g. 1000 = 1,000 units).",
        dependsOn: { field: "setPrice", value: true },
      },
      overrideDiscount: {
        type: "boolean",
        variant: "toggle",
        label: "Override Default Discount",
        async: true,
        asyncDescription: true,
        dependsOn: [
          { field: "isFreeCredit", value: false },
          { field: "setPrice", value: false },
        ],
      },
      discountPercent: {
        type: "number",
        variant: "text",
        async: true,
        label: "AWU Discount (%)",
        description: "Discount applied to the AWU commit invoice.",
        dependsOn: [
          { field: "overrideDiscount", value: true },
          { field: "setPrice", value: false },
        ],
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
      purchaseOrderId: {
        type: "string",
        variant: "text",
        label: "Purchase Order ID (optional)",
        description:
          "Customer's PO number to include on the Metronome-generated Stripe invoice.",
        dependsOn: { field: "isFreeCredit", value: false },
      },
      confirm: {
        type: "boolean",
        label: "⚠️ Confirm grant",
        description:
          "I confirm that I want to grant these AWU credits. Free credits give money to the customer; prepaid commits assume the customer is invoiced separately.",
      },
    },
  },
  isApplicableTo: (auth) => {
    const plan = auth.plan();
    return plan !== null && isCreditPricedPlan(plan);
  },
  populateAsyncArgs: async (auth) => {
    const workspace = auth.getNonNullableWorkspace();
    const defaultDiscount = await resolveAwuPurchaseDiscountPercent(auth);

    // Resolve currency for the price-field hint. Swallow errors here so the
    // form still loads for workspaces without an active Metronome contract
    // (e.g. when the operator only intends to grant a free credit).
    const currencyResult = await resolveAwuPurchaseCurrency(workspace.sId);
    const priceDescription = currencyResult.isOk()
      ? `Total invoice amount in ${currencyResult.value.toUpperCase()} (e.g. 1000 = 1,000 ${currencyResult.value.toUpperCase()}).`
      : "Total invoice amount in the customer's billing currency.";

    const today = new Date();
    const oneYearFromNow = addYears(today, 1);
    return new Ok({
      overrideDiscount_description: `Override the customer's default discount. Current default for ${workspace.name}: ${defaultDiscount}%`,
      discountPercent: defaultDiscount,
      price_description: priceDescription,
      startDate: format(today, "yyyy-MM-dd"),
      expirationDate: format(oneYearFromNow, "yyyy-MM-dd"),
    });
  },
  execute: async (auth, _, args) => {
    const validationResult = GrantAwuCreditsArgsSchema.safeParse(args);
    if (!validationResult.success) {
      return new Err(new Error(fromZodError(validationResult.error).message));
    }

    const validatedArgs = validationResult.data;
    const workspace = auth.getNonNullableWorkspace();

    const startDate = new Date(validatedArgs.startDate);
    const expirationDate = new Date(validatedArgs.expirationDate);
    if (expirationDate <= startDate) {
      return new Err(new Error("Expiration date must be after start date."));
    }

    const metronomeCustomerId = workspace.metronomeCustomerId;
    if (!metronomeCustomerId) {
      return new Err(
        new Error(
          `Workspace "${workspace.name}" is not provisioned in Metronome.`
        )
      );
    }

    const { amountCredits, isFreeCredit } = validatedArgs;
    const formattedStart = format(startDate, "yyyy-MM-dd");
    const formattedEnd = format(expirationDate, "yyyy-MM-dd");
    const idempotencyKey = `grant-awu-${isFreeCredit ? "free" : "commit"}-${workspace.sId}-${startDate.getTime()}-${expirationDate.getTime()}-${amountCredits}`;

    if (isFreeCredit) {
      const result = await createMetronomeCredit({
        metronomeCustomerId,
        productId: getProductFreeCreditId(),
        creditTypeId: getCreditTypeAwuId(),
        amount: amountCredits,
        startingAt: startDate.toISOString(),
        endingBefore: expirationDate.toISOString(),
        name: `Credits granted by Dust representative: ${amountCredits.toLocaleString()} credits`,
        idempotencyKey,
        priority: AWU_PRIORITY_PURCHASED_COMMIT,
        applicableProductTags: ["usage"],
      });

      if (result.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            metronomeCustomerId,
            amountCredits,
            error: result.error.message,
          },
          "[Poke Plugin] Failed to grant free AWU credits in Metronome"
        );
        return new Err(result.error);
      }

      return new Ok({
        display: "text",
        value: `Successfully granted ${amountCredits.toLocaleString()} FREE AWU credits (${formattedStart} to ${formattedEnd}). No invoice was generated.`,
      });
    }

    // Commit path: an invoice is raised through Metronome. The invoice
    // unit price mirrors `awu_purchase` semantics — full AWU rate adjusted
    // by the workspace's AWU discount, converted to Metronome's fiat unit.
    const metronomeContractId = auth.subscription()?.metronomeContractId;
    if (!metronomeContractId) {
      return new Err(
        new Error(
          `Workspace "${workspace.name}" has no active Metronome contract.`
        )
      );
    }

    const currencyResult = await resolveAwuPurchaseCurrency(workspace.sId);
    if (currencyResult.isErr()) {
      return new Err(
        new Error(
          `Failed to resolve billing currency: ${currencyResult.error.message}`
        )
      );
    }
    const currency: SupportedCurrency = currencyResult.value;

    let invoiceUnitPrice: number;
    let discountPercent = 0;

    if (validatedArgs.setPrice) {
      // Operator-supplied price wins — skip rate computation and any
      // workspace discount.
      invoiceUnitPrice = metronomeAmount(
        Math.round(validatedArgs.price! * 100),
        currency
      );
    } else {
      discountPercent = validatedArgs.overrideDiscount
        ? validatedArgs.discountPercent
        : await resolveAwuPurchaseDiscountPercent(auth);

      invoiceUnitPrice = computeAwuInvoiceUnitPrice({
        amountCredits,
        currency,
        discountPercent,
      });
    }

    const commitNameBase = validatedArgs.setPrice
      ? `Commits added by Dust representative: ${amountCredits.toLocaleString()} credits (manual price)`
      : discountPercent > 0
        ? `Commits added by Dust representative: ${amountCredits.toLocaleString()} credits (${discountPercent}% discount)`
        : `Commits added by Dust representative: ${amountCredits.toLocaleString()} credits`;
    const commitName = validatedArgs.purchaseOrderId
      ? `${commitNameBase} [PO: ${validatedArgs.purchaseOrderId}]`
      : commitNameBase;

    const result = await createMetronomeCommit({
      metronomeCustomerId,
      productId: getProductPrepaidCommitId(),
      creditTypeId: getCreditTypeAwuId(),
      amount: amountCredits,
      startingAt: startDate,
      endingBefore: expirationDate,
      name: commitName,
      idempotencyKey,
      priority: AWU_PRIORITY_PURCHASED_COMMIT,
      invoiceSchedule: {
        contractId: metronomeContractId,
        creditTypeId: CURRENCY_TO_CREDIT_TYPE_ID[currency],
        unitPrice: invoiceUnitPrice,
        quantity: 1,
        timestamp: startDate,
      },
    });

    if (result.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          metronomeCustomerId,
          amountCredits,
          discountPercent,
          invoiceUnitPrice,
          currency,
          error: result.error.message,
        },
        "[Poke Plugin] Failed to grant prepaid AWU commit in Metronome"
      );
      return new Err(result.error);
    }

    const pricingSuffix = validatedArgs.setPrice
      ? ` at a manual price of ${validatedArgs.price!.toLocaleString()} ${currency.toUpperCase()}`
      : discountPercent > 0
        ? ` with ${discountPercent}% discount (${currency.toUpperCase()})`
        : ` (${currency.toUpperCase()})`;

    return new Ok({
      display: "text",
      value: `Successfully granted ${amountCredits.toLocaleString()} AWU credits as a prepaid commit${pricingSuffix} (${formattedStart} to ${formattedEnd}). Metronome will invoice the customer.`,
    });
  },
});
