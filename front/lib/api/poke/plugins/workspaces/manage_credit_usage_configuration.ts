import { syncMetronomeBalanceThresholdAlert } from "@app/lib/api/credits/balance_threshold_alert";
import { syncCreditBasedPayg } from "@app/lib/api/credits/credit_based_payg";
import {
  getProgrammaticUsageLimit,
  syncProgrammaticUsageLimit,
} from "@app/lib/api/credits/programmatic_usage_limit";
import {
  getUsageConfiguration,
  updateUsageConfiguration,
} from "@app/lib/api/credits/usage_configuration";
import { createPlugin } from "@app/lib/api/poke/types";
import {
  getDefaultUserSpendLimit,
  setDefaultUserSpendLimit,
} from "@app/lib/api/workspace/default_user_spend_limit";
import { MAX_AWU_DISCOUNT_PERCENT } from "@app/lib/credits/awu_purchase_constants";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { isCreditPricedPlan } from "@app/types/plan";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

export const MAX_AWU_USAGE_CAP_CREDITS = 2_000_000;
const POKE_AUDIT_CONTEXT = { location: "poke" };

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
  balanceThresholdCredits: z
    .number()
    .int("Balance threshold must be an integer number of credits")
    .min(0, "Balance threshold must be non-negative")
    .default(0),
  defaultPoolCapCredits: z
    .number()
    .int("Default pool cap must be an integer number of credits")
    .min(0, "Default pool cap must be non-negative")
    .default(0),
  programmaticMonthlyCapCredits: z
    .number()
    .int("Programmatic monthly cap must be an integer number of credits")
    .min(0, "Programmatic monthly cap must be non-negative")
    .default(0),
  autoSeatUpgradeEnabled: z.boolean().default(false),
});

export const manageCreditUsageConfigurationPlugin = createPlugin({
  manifest: {
    id: "manage-credit-usage-configuration",
    name: "Manage Credit Usage Configuration",
    description:
      "Configure AWU credit usage settings: discount, PAYG, programmatic cap, " +
      "workspace usage cap, balance threshold alert, default per-user pool limit, " +
      "and auto-upgrade seats.",
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
          "Enable Pay-as-you-go for this workspace (Metronome-billed workspaces only).",
        async: true,
      },
      usageCapCredits: {
        type: "number",
        variant: "text",
        label: "Workspace Credit Pool Monthly Usage Cap (credits)",
        description: `Workspace-level monthly spend cap for the Metronome spend-threshold alert. Set to 0 to disable. Range: 0-${MAX_AWU_USAGE_CAP_CREDITS.toLocaleString()}.`,
        async: true,
      },
      balanceThresholdCredits: {
        type: "number",
        variant: "text",
        label: "Workspace Credit Pool Balance Threshold Alert (credits)",
        description:
          "Email admins when the workspace pool balance drops below this amount. Set to 0 to disable.",
        async: true,
      },
      defaultPoolCapCredits: {
        type: "number",
        variant: "text",
        label: "Default Per-User Pool Limit (credits)",
        description:
          "Default pool credit limit added on top of each seat's allowance. Set to 0 to prevent pool usage.",
        async: true,
      },
      programmaticMonthlyCapCredits: {
        type: "number",
        variant: "text",
        label: "Programmatic Monthly Cap (credits)",
        description:
          "Monthly cap on programmatic (API) AWU usage. Set to 0 to disable.",
        async: true,
      },
      autoSeatUpgradeEnabled: {
        type: "boolean",
        variant: "toggle",
        label: "Auto-Upgrade Seats",
        description:
          "Automatically upgrade members to the next seat tier when they hit their credit limit.",
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

    const [defaultPoolLimit, programmaticLimit, usageConfig] =
      await Promise.all([
        getDefaultUserSpendLimit(auth),
        getProgrammaticUsageLimit(auth),
        getUsageConfiguration(auth),
      ]);

    return new Ok({
      defaultDiscountPercent: config?.defaultDiscountPercent ?? 0,
      paygEnabled: config?.paygEnabled ?? false,
      usageCapCredits: config?.usageCapCredits ?? 0,
      balanceThresholdCredits: config?.balanceThresholdAwuCredits ?? 0,
      defaultPoolCapCredits: defaultPoolLimit.isOk()
        ? (defaultPoolLimit.value.awuCredits ?? 0)
        : 0,
      programmaticMonthlyCapCredits: programmaticLimit.isOk()
        ? (programmaticLimit.value ?? 0)
        : 0,
      autoSeatUpgradeEnabled: usageConfig.autoSeatUpgradeEnabled,
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

    const {
      defaultDiscountPercent,
      paygEnabled,
      usageCapCredits,
      balanceThresholdCredits,
      defaultPoolCapCredits,
      programmaticMonthlyCapCredits,
      autoSeatUpgradeEnabled,
    } = parseResult.data;

    const resolvedUsageCapCredits =
      usageCapCredits > 0 ? usageCapCredits : null;

    // 1. Core config (discount, PAYG, workspace usage cap).
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

    // 2. Balance threshold alert.
    const balanceResult = await syncMetronomeBalanceThresholdAlert({
      auth,
      balanceThresholdCredits:
        balanceThresholdCredits > 0 ? balanceThresholdCredits : null,
    });
    if (balanceResult.isErr()) {
      return new Err(balanceResult.error);
    }

    // 3. Default per-user pool limit.
    const poolResult = await setDefaultUserSpendLimit(auth, {
      awuCredits: defaultPoolCapCredits,
      auditContext: POKE_AUDIT_CONTEXT,
    });
    if (poolResult.isErr()) {
      return new Err(poolResult.error);
    }

    // 4. Programmatic monthly cap.
    const programmaticResult = await syncProgrammaticUsageLimit({
      auth,
      monthlyCapCredits:
        programmaticMonthlyCapCredits > 0
          ? programmaticMonthlyCapCredits
          : null,
      auditContext: POKE_AUDIT_CONTEXT,
    });
    if (programmaticResult.isErr()) {
      return new Err(programmaticResult.error);
    }

    // 5. Auto-upgrade seats toggle.
    const toggleResult = await updateUsageConfiguration(auth, {
      autoSeatUpgradeEnabled,
    });
    if (toggleResult.isErr()) {
      return new Err(toggleResult.error);
    }

    return new Ok({
      display: "text",
      value: [
        existingConfig ? "Changes saved" : "Configuration created",
        `Discount: ${defaultDiscountPercent}%`,
        `PAYG: ${paygEnabled ? "on" : "off"}`,
        `Usage cap: ${resolvedUsageCapCredits?.toLocaleString() ?? "disabled"}`,
        `Balance threshold: ${balanceThresholdCredits > 0 ? `${balanceThresholdCredits.toLocaleString()} credits` : "disabled"}`,
        `Pool limit: ${defaultPoolCapCredits.toLocaleString()} credits`,
        `Programmatic cap: ${programmaticMonthlyCapCredits > 0 ? `${programmaticMonthlyCapCredits.toLocaleString()} credits/month` : "disabled"}`,
        `Auto-upgrade: ${autoSeatUpgradeEnabled ? "on" : "off"}`,
      ].join(". "),
    });
  },
});
