import { createPlugin } from "@app/lib/api/poke/types";
import {
  getNonCreditPricedDefaultUserSpendLimit,
  setNonCreditPricedDefaultUserSpendLimit,
} from "@app/lib/api/workspace/default_user_spend_limit";
import {
  MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
  MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
} from "@app/types/credits";
import { isCreditPricedPlan } from "@app/types/plan";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const POKE_AUDIT_CONTEXT = { location: "poke" };

const SetDefaultUserCreditLimitArgsSchema = z.object({
  awuCredits: z
    .number()
    .int("The limit must be a whole number of credits")
    .min(
      MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
      `The limit must be at least ${MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS} credits`
    )
    .max(
      MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
      `The limit must be at most ${MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS} credits`
    ),
});

export const setDefaultUserCreditLimitPlugin = createPlugin({
  manifest: {
    id: "set-default-user-credit-limit",
    name: "Set Per-Member Credit Limit (Legacy Plans)",
    description:
      "Set the workspace-wide per-member credit limit: the maximum number of " +
      "AWU credits any single member can spend per calendar month. Applies to " +
      "current and future members — it is a limit per member, not a shared " +
      "workspace pool. Once a member reaches it they cannot send messages until " +
      "the next month.",
    resourceTypes: ["workspaces"],
    args: {
      awuCredits: {
        type: "number",
        variant: "text",
        label: "Limit per member (AWU credits per calendar month)",
        description:
          "Credits each member can spend per calendar month (UTC). Set to 0 to " +
          "remove the limit. Can be overridden for an individual member from " +
          "the members table.",
        async: true,
      },
    },
    requiredRoles: ["billing"],
  },
  // Credit-priced workspaces have their own default (seat allowance + pool limit,
  // mirrored to Metronome alerts): they set it through
  // `manage-credit-usage-configuration` instead.
  isApplicableTo: (auth) => {
    const plan = auth.plan();
    return plan === null || !isCreditPricedPlan(plan);
  },
  populateAsyncArgs: async (auth) => {
    return new Ok({
      awuCredits: await getNonCreditPricedDefaultUserSpendLimit(auth),
    });
  },
  execute: async (auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const validationResult =
      SetDefaultUserCreditLimitArgsSchema.safeParse(args);
    if (!validationResult.success) {
      return new Err(new Error(fromError(validationResult.error).toString()));
    }
    const { awuCredits } = validationResult.data;

    const result = await setNonCreditPricedDefaultUserSpendLimit(auth, {
      awuCredits,
      auditContext: POKE_AUDIT_CONTEXT,
    });
    if (result.isErr()) {
      return new Err(new Error(result.error.message));
    }

    if (awuCredits === 0) {
      return new Ok({
        display: "text",
        value:
          "Removed the workspace per-member credit limit. Members with an " +
          "individual limit set from the members table keep it.",
      });
    }

    return new Ok({
      display: "text",
      value:
        `Every member of ${workspace.name} can now spend up to ` +
        `${awuCredits.toLocaleString()} AWU credits per calendar month.`,
    });
  },
});
