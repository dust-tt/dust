import { createPlugin } from "@app/lib/api/poke/types";
import {
  computeAwuInvoiceUnitPrice,
  resolveAwuPurchaseCurrency,
  resolveAwuPurchaseDiscountPercent,
} from "@app/lib/credits/awu_discount";
import { MAX_AWU_DISCOUNT_PERCENT } from "@app/lib/credits/awu_purchase_constants";
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
    confirm: z.boolean(),
  })
  .refine((data) => data.confirm === true, {
    message: "Please confirm by checking the confirmation box",
    path: ["confirm"],
  });

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
        variant: "text",
        async: true,
        label: "AWU Discount (%)",
        description: "Discount applied to the AWU commit invoice.",
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

    const today = new Date();
    const oneYearFromNow = addYears(today, 1);
    return new Ok({
      overrideDiscountDescription: `Override the customer's default discount. Current default for ${workspace.name}: ${defaultDiscount}%`,
      discountPercent: defaultDiscount,
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
        name: `Credits granted from Poke: ${amountCredits.toLocaleString()} credits`,
        idempotencyKey,
        priority: 1,
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
    // Metronome also requires `invoice_contract_id` whenever a customer-
    // level commit ships with an `invoice_schedule`, so we need the
    // workspace's active Metronome contract.
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
    const currency = currencyResult.value;

    const discountPercent = validatedArgs.overrideDiscount
      ? validatedArgs.discountPercent
      : await resolveAwuPurchaseDiscountPercent(auth);

    const invoiceUnitPrice = computeAwuInvoiceUnitPrice({
      amountCredits,
      currency,
      discountPercent,
    });

    const commitName =
      discountPercent > 0
        ? `Commits granted from Poke: ${amountCredits.toLocaleString()} credits (${discountPercent}% discount)`
        : `Commits granted from Poke: ${amountCredits.toLocaleString()} credits`;

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

    const discountSuffix =
      discountPercent > 0 ? ` with ${discountPercent}% discount` : "";

    return new Ok({
      display: "text",
      value: `Successfully granted ${amountCredits.toLocaleString()} AWU credits as a prepaid commit${discountSuffix} (${formattedStart} to ${formattedEnd}). Metronome will invoice the customer.`,
    });
  },
});
