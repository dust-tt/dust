import assert from "assert";
import type Stripe from "stripe";
import { z } from "zod";

import { createPlugin } from "@app/lib/api/poke/types";
import {
  calculateFreeCreditAmountCents,
  countEligibleUsersForFreeCredits,
} from "@app/lib/credits/free";
import {
  startOrResumeEnterprisePAYG,
  stopEnterprisePAYG,
} from "@app/lib/credits/payg";
import {
  getStripeSubscription,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { Err, Ok } from "@app/types";

const MAX_FREE_CREDITS_DOLLARS = 10000;
const MAX_PAYG_CAP_DOLLARS = 100000;

const ManageProgrammaticUsageConfigurationSchema = z
  .object({
    freeCreditsOverrideEnabled: z.boolean(),
    freeCreditsDollars: z
      .number()
      .min(0, "Free credits must be positive")
      .max(
        MAX_FREE_CREDITS_DOLLARS,
        `Free credits cannot exceed $${MAX_FREE_CREDITS_DOLLARS.toLocaleString()}`
      )
      .optional(),
    defaultDiscountPercent: z
      .number()
      .min(0, "Discount percentage must be at least 0")
      .max(100, "Discount percentage cannot exceed 100")
      .optional()
      .default(0),
    paygEnabled: z.boolean(),
    paygCapDollars: z
      .number()
      .min(1, "PAYG cap must be at least $1")
      .max(
        MAX_PAYG_CAP_DOLLARS,
        `PAYG cap cannot exceed $${MAX_PAYG_CAP_DOLLARS.toLocaleString()}`
      )
      .optional(),
  })
  .refine(
    (data) => {
      if (
        data.freeCreditsOverrideEnabled &&
        (!data.freeCreditsDollars || data.freeCreditsDollars < 1)
      ) {
        return false;
      }
      return true;
    },
    {
      message: "Free credits amount is required when override is enabled",
      path: ["freeCreditsDollars"],
    }
  )
  .refine(
    (data) => {
      if (
        data.paygEnabled &&
        (!data.paygCapDollars || data.paygCapDollars < 1)
      ) {
        return false;
      }
      return true;
    },
    {
      message: "PAYG cap is required when Pay-as-you-go is enabled",
      path: ["paygCapDollars"],
    }
  );

export const manageProgrammaticUsageConfigurationPlugin = createPlugin({
  manifest: {
    id: "manage-programmatic-usage-configuration",
    name: "Manage Programmatic Usage Configuration",
    description:
      "View and configure programmatic usage settings for this workspace. " +
      "Set monthly recurring free credits and default discount percentage applied when computing usage costs.",
    resourceTypes: ["workspaces"],
    args: {
      freeCreditsOverrideEnabled: {
        type: "boolean",
        variant: "toggle",
        label: "Override Monthly Free Credits",
        async: true,
        asyncDescription: true,
      },
      freeCreditsDollars: {
        type: "number",
        label: "Monthly Free Credits (USD)",
        description: `Custom monthly free credits ($1-$${MAX_FREE_CREDITS_DOLLARS.toLocaleString()}).`,
        async: true,
        dependsOn: { field: "freeCreditsOverrideEnabled", value: true },
      },
      defaultDiscountPercent: {
        type: "number",
        label: "Default Discount (%)",
        description:
          "Discount applied by default to programmatic credit purchases, PAYG or committed.",
        async: true,
      },
      paygEnabled: {
        type: "boolean",
        variant: "toggle",
        label: "Pay-as-you-go",
        description:
          "Enable pay-as-you-go billing (enterprise only). When enabled, programmatic usage will still be possible after free and committed credits are exhausted. Requires a spending cap.",
        async: true,
      },
      paygCapDollars: {
        type: "number",
        label: "Pay-as-you-go Spending Cap (US$)",
        description: `Maximum monthly PAYG spending (required to enable PAYG). Range: $1-$${MAX_PAYG_CAP_DOLLARS.toLocaleString()}.`,
        async: true,
        dependsOn: { field: "paygEnabled", value: true },
      },
    },
  },

  populateAsyncArgs: async (auth) => {
    const workspace = auth.getNonNullableWorkspace();
    const userCount = await countEligibleUsersForFreeCredits(workspace);
    const automaticCreditsCents = calculateFreeCreditAmountCents(userCount);
    const automaticCreditsDollars = automaticCreditsCents / 100;

    const freeCreditsDescription = `Override automatic free credits. Current automatic amount: $${automaticCreditsDollars.toLocaleString()}`;

    const config =
      await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);

    if (!config) {
      return new Ok({
        freeCreditsOverrideEnabled: false,
        freeCreditsOverrideEnabledDescription: freeCreditsDescription,
        freeCreditsDollars: undefined,
        defaultDiscountPercent: 0,
        paygEnabled: false,
        paygCapDollars: 0,
      });
    }

    const paygCapDollars =
      config.paygCapCents !== null ? config.paygCapCents / 100 : 0;

    return new Ok({
      freeCreditsOverrideEnabled: config.freeCreditCents !== null,
      freeCreditsOverrideEnabledDescription: freeCreditsDescription,
      freeCreditsDollars:
        config.freeCreditCents !== null
          ? config.freeCreditCents / 100
          : undefined,
      defaultDiscountPercent: config.defaultDiscountPercent,
      paygEnabled: config.paygCapCents !== null && config.paygCapCents > 0,
      paygCapDollars,
    });
  },

  execute: async (auth, _, args) => {
    const parseResult =
      ManageProgrammaticUsageConfigurationSchema.safeParse(args);

    if (!parseResult.success) {
      return new Err(
        new Error(
          `Invalid arguments: ${parseResult.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ")}`
        )
      );
    }

    const {
      freeCreditsOverrideEnabled,
      freeCreditsDollars,
      defaultDiscountPercent,
      paygEnabled,
      paygCapDollars,
    } = parseResult.data;

    let stripeSubscription: Stripe.Subscription | null = null;
    const subscription = auth.subscription();
    if (subscription?.stripeSubscriptionId) {
      stripeSubscription = await getStripeSubscription(
        subscription.stripeSubscriptionId
      );
    }

    if (paygEnabled) {
      if (
        !stripeSubscription ||
        !isEnterpriseSubscription(stripeSubscription)
      ) {
        return new Err(
          new Error("PAYG can only be enabled for enterprise subscriptions.")
        );
      }
    }

    // When override is disabled, use automatic brackets algorithm
    const freeCreditCents =
      freeCreditsOverrideEnabled && freeCreditsDollars
        ? Math.round(freeCreditsDollars * 100)
        : undefined;

    // Handle non-PAYG config fields first
    const existingConfig =
      await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);

    if (existingConfig) {
      const updateResult = await existingConfig.updateConfiguration(auth, {
        freeCreditCents,
        defaultDiscountPercent,
      });
      if (updateResult.isErr()) {
        return updateResult;
      }
    } else {
      const createResult = await ProgrammaticUsageConfigurationResource.makeNew(
        auth,
        {
          freeCreditCents,
          defaultDiscountPercent,
          paygCapCents: null,
        }
      );
      if (createResult.isErr()) {
        return createResult;
      }
    }

    // Handle PAYG enable/disable
    if (paygEnabled && stripeSubscription) {
      assert(
        paygCapDollars !== undefined,
        "[Unreachable] PaygEnabled but paygCapDollars undefined"
      );
      const paygCapCents = Math.round(paygCapDollars * 100);
      const paygResult = await startOrResumeEnterprisePAYG({
        auth,
        stripeSubscription,
        paygCapCents,
      });
      if (paygResult.isErr()) {
        return paygResult;
      }
    } else {
      // Check if PAYG was previously enabled and needs to be stopped
      const refreshedConfig =
        await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
      if (refreshedConfig?.paygCapCents !== null && stripeSubscription) {
        const stopResult = await stopEnterprisePAYG({
          auth,
          stripeSubscription,
        });
        if (stopResult.isErr()) {
          return stopResult;
        }
      }
    }

    const paygStatus = paygEnabled
      ? `PAYG enabled with $${paygCapDollars} cap`
      : "PAYG disabled";

    return new Ok({
      display: "text",
      value: `${existingConfig ? "Changes saved" : "Configuration created"}. ${paygStatus}.`,
    });
  },
});
