import { syncCreditBasedPayg } from "@app/lib/api/credits/credit_based_payg";
import { createPlugin } from "@app/lib/api/poke/types";
import { MAX_AWU_DISCOUNT_PERCENT } from "@app/lib/credits/awu_purchase_constants";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { isCreditPricedPlan } from "@app/types/plan";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

export const MAX_AWU_USAGE_CAP_CREDITS = 2_000_000;

const CreditUsageConfigurationSchema = z.object({
  defaultDiscountPercent: z
    .number()
    .min(0, "Discount percentage must be at least 0")
    .max(
      MAX_AWU_DISCOUNT_PERCENT,
      `Discount cannot exceed ${MAX_AWU_DISCOUNT_PERCENT}% for AWU credit purchases`
    )
    .default(0),
  paygEnabled: z.boolean(),
  usageCapCredits: z
    .number()
    .int("AWU usage cap must be an integer number of credits")
    .min(0, "AWU usage cap must be non-negative")
    .max(
      MAX_AWU_USAGE_CAP_CREDITS,
      `AWU usage cap cannot exceed ${MAX_AWU_USAGE_CAP_CREDITS.toLocaleString()} credits`
    )
    .default(0),
});

export const manageCreditUsageConfigurationPlugin = createPlugin({
  manifest: {
    id: "manage-credit-usage-configuration",
    name: "Manage Credit Usage Configuration",
    description:
      "Configure AWU credit usage settings for this workspace: the default " +
      "discount applied to AWU credit purchases, whether PAYG is enabled, " +
      "and the workspace usage cap (in AWU credits) used to drive the " +
      "Metronome spend-threshold alert. PAYG and the usage cap are " +
      "independent: either can be set without the other.",
    resourceTypes: ["workspaces"],
    args: {
      defaultDiscountPercent: {
        type: "number",
        variant: "text",
        label: "Default Discount (%)",
        description: `Discount applied to AWU credit purchases (0-${MAX_AWU_DISCOUNT_PERCENT}%).`,
        async: true,
      },
      paygEnabled: {
        type: "boolean",
        variant: "toggle",
        label: "PAYG Enabled",
        description:
          "Enable Pay-as-you-go for this workspace (Metronome-billed " +
          "workspaces only). Independent from the usage cap below.",
        async: true,
      },
      usageCapCredits: {
        type: "number",
        variant: "text",
        label: "AWU Usage Cap (credits)",
        description: `Workspace usage cap (in AWU credits) at which the Metronome spend-threshold alert fires. Set to 0 to disable the alert. Range: 0-${MAX_AWU_USAGE_CAP_CREDITS.toLocaleString()}.`,
        async: true,
      },
    },
    requiredRoles: ["billing"],
  },

  isApplicableTo: (auth) => {
    const plan = auth.plan();
    return plan !== null && isCreditPricedPlan(plan);
  },

  populateAsyncArgs: async (auth) => {
    const config =
      await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);

    if (!config) {
      return new Ok({
        defaultDiscountPercent: 0,
        paygEnabled: false,
        usageCapCredits: 0,
      });
    }

    return new Ok({
      defaultDiscountPercent: config.defaultDiscountPercent,
      paygEnabled: config.paygEnabled,
      usageCapCredits: config.usageCapCredits ?? 0,
    });
  },

  execute: async (auth, _, args) => {
    const plan = auth.plan();
    if (!plan || !isCreditPricedPlan(plan)) {
      return new Err(
        new Error(
          "This plugin is only applicable to credit-priced plan workspaces."
        )
      );
    }

    const parseResult = CreditUsageConfigurationSchema.safeParse(args);

    if (!parseResult.success) {
      return new Err(
        new Error(
          `Invalid arguments: ${parseResult.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ")}`
        )
      );
    }

    const { defaultDiscountPercent, paygEnabled, usageCapCredits } =
      parseResult.data;

    const resolvedUsageCapCredits =
      usageCapCredits > 0 ? usageCapCredits : null;

    const existingConfig =
      await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);

    if (existingConfig) {
      const updateResult = await existingConfig.updateConfiguration(auth, {
        defaultDiscountPercent,
        paygEnabled,
        usageCapCredits: resolvedUsageCapCredits,
      });
      if (updateResult.isErr()) {
        return updateResult;
      }
    } else {
      const createResult = await CreditUsageConfigurationResource.makeNew(
        auth,
        {
          defaultDiscountPercent,
          paygEnabled,
          usageCapCredits: resolvedUsageCapCredits,
        }
      );
      if (createResult.isErr()) {
        return createResult;
      }
    }

    const paygResult = await syncCreditBasedPayg({
      auth,
      paygEnabled,
      usageCapCredits: resolvedUsageCapCredits,
    });
    if (paygResult.isErr()) {
      return paygResult;
    }

    const discountStatus = `Discount: ${defaultDiscountPercent}%`;
    const paygStatus = `PAYG: ${paygEnabled ? "enabled" : "disabled"}`;
    const capStatus =
      resolvedUsageCapCredits !== null
        ? `Usage cap: ${resolvedUsageCapCredits.toLocaleString()} credits`
        : "Usage cap: disabled";

    return new Ok({
      display: "text",
      value: `${existingConfig ? "Changes saved" : "Configuration created"}. ${discountStatus}. ${paygStatus}. ${capStatus}.`,
    });
  },
});
