import { createPlugin } from "@app/lib/api/poke/types";
import {
  createMetronomeCommit,
  createMetronomeCredit,
} from "@app/lib/metronome/client";
import {
  AWU_PRIORITY_PURCHASED_COMMIT,
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

// Free AWU credits are consumed before any seat allocation (200) or
// purchased commits (300) — see `AWU commit priorities` in
// `front/lib/metronome/constants.ts`.
const FREE_AWU_CREDIT_PRIORITY = 100;

const GrantAwuCreditsArgsSchema = z
  .object({
    amountCredits: z
      .number()
      .int("Amount must be a whole number of credits")
      .positive("Amount must be greater than 0")
      .finite("Amount must be a valid number"),
    isFreeCredit: z.boolean(),
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
      "assumes the customer is already invoiced separately).",
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
  populateAsyncArgs: async () => {
    const today = new Date();
    const oneYearFromNow = addYears(today, 1);
    return new Ok({
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
        name: `Free AWU credits (${amountCredits.toLocaleString()} credits, poke grant)`,
        idempotencyKey,
        priority: FREE_AWU_CREDIT_PRIORITY,
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

    const result = await createMetronomeCommit({
      metronomeCustomerId,
      productId: getProductPrepaidCommitId(),
      creditTypeId: getCreditTypeAwuId(),
      amount: amountCredits,
      startingAt: startDate,
      endingBefore: expirationDate,
      name: `Prepaid AWU commit (${amountCredits.toLocaleString()} credits, poke grant)`,
      idempotencyKey,
      priority: AWU_PRIORITY_PURCHASED_COMMIT,
    });

    if (result.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          metronomeCustomerId,
          amountCredits,
          error: result.error.message,
        },
        "[Poke Plugin] Failed to grant prepaid AWU commit in Metronome"
      );
      return new Err(result.error);
    }

    return new Ok({
      display: "text",
      value: `Successfully granted ${amountCredits.toLocaleString()} AWU credits as a prepaid commit (${formattedStart} to ${formattedEnd}). No invoice was generated by this plugin — make sure the customer is billed separately.`,
    });
  },
});
