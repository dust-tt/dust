import { syncMetronomeBalanceThresholdAlert } from "@app/lib/api/credits/balance_threshold_alert";
import { syncCreditBasedPayg } from "@app/lib/api/credits/credit_based_payg";
import {
  getProgrammaticUsageLimit,
  syncProgrammaticUsageLimit,
} from "@app/lib/api/credits/programmatic_usage_limit";
import { updateUsageConfiguration } from "@app/lib/api/credits/usage_configuration";
import { createPlugin } from "@app/lib/api/poke/types";
import {
  getDefaultUserSpendLimit,
  setDefaultUserSpendLimit,
} from "@app/lib/api/workspace/default_user_spend_limit";
import { MAX_AWU_DISCOUNT_PERCENT } from "@app/lib/credits/awu_purchase_constants";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import {
  DEFAULT_AUTO_INVOICE_FINALIZATION_ENABLED,
  DEFAULT_AUTO_SEAT_UPGRADE_ENABLED,
  DEFAULT_TOP_UP_ENABLED,
} from "@app/lib/resources/storage/models/credit_usage_configurations";
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
  topUpEnabled: z.boolean().default(false),
  autoInvoiceFinalizationEnabled: z.boolean().default(true),
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
      topUpEnabled: {
        type: "boolean",
        variant: "toggle",
        label: "Top-Up Enabled (Enterprise)",
        description:
          "Show the 'Top up' button on the Usage page for enterprise-plan workspaces.",
        async: true,
      },
      autoInvoiceFinalizationEnabled: {
        type: "boolean",
        variant: "toggle",
        label: "Auto Invoice Finalization",
        description:
          "Automatically finalize Metronome-pushed Stripe draft invoices. Disable to leave invoices as cleaned drafts for manual review.",
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

    const [defaultPoolLimit, programmaticLimit] = await Promise.all([
      getDefaultUserSpendLimit(auth),
      getProgrammaticUsageLimit(auth),
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
      autoSeatUpgradeEnabled:
        config?.autoSeatUpgradeEnabled ?? DEFAULT_AUTO_SEAT_UPGRADE_ENABLED,
      topUpEnabled: config?.topUpEnabled ?? DEFAULT_TOP_UP_ENABLED,
      autoInvoiceFinalizationEnabled:
        config?.autoInvoiceFinalizationEnabled ??
        DEFAULT_AUTO_INVOICE_FINALIZATION_ENABLED,
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
      topUpEnabled,
      autoInvoiceFinalizationEnabled,
    } = parseResult.data;

    const resolvedUsageCapCredits =
      usageCapCredits > 0 ? usageCapCredits : null;
    const resolvedBalanceThresholdCredits =
      balanceThresholdCredits > 0 ? balanceThresholdCredits : null;
    const resolvedProgrammaticMonthlyCapCredits =
      programmaticMonthlyCapCredits > 0 ? programmaticMonthlyCapCredits : null;

    // Fetch current state upfront so each sync step can be skipped when its
    // inputs haven't changed (avoids triggering seat reconciliation for every
    // save regardless of what actually changed).
    const [existingConfig, currentPoolLimit, currentProgrammaticLimit] =
      await Promise.all([
        CreditUsageConfigurationResource.fetchByWorkspaceId(auth),
        getDefaultUserSpendLimit(auth),
        getProgrammaticUsageLimit(auth),
      ]);

    const currentPoolCapCredits = currentPoolLimit.isOk()
      ? (currentPoolLimit.value.awuCredits ?? 0)
      : 0;
    const currentProgrammaticCapCredits = currentProgrammaticLimit.isOk()
      ? (currentProgrammaticLimit.value ?? 0)
      : 0;

    // 1. Core config (discount, PAYG, workspace usage cap, static flags).
    if (existingConfig) {
      const updateResult = await existingConfig.updateConfiguration(auth, {
        defaultDiscountPercent,
        paygEnabled,
        usageCapCredits: resolvedUsageCapCredits,
        topUpEnabled,
        autoInvoiceFinalizationEnabled,
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
          topUpEnabled,
          autoInvoiceFinalizationEnabled,
        }
      );
      if (createResult.isErr()) {
        return createResult;
      }
    }

    // Only sync PAYG when paygEnabled or usageCapCredits changed.
    const paygChanged =
      paygEnabled !== (existingConfig?.paygEnabled ?? false) ||
      resolvedUsageCapCredits !== (existingConfig?.usageCapCredits ?? null);
    if (paygChanged) {
      const paygResult = await syncCreditBasedPayg({
        auth,
        paygEnabled,
        usageCapCredits: resolvedUsageCapCredits,
      });
      if (paygResult.isErr()) {
        return paygResult;
      }
    }

    // 2. Balance threshold alert — only sync when the threshold changed.
    const balanceChanged =
      resolvedBalanceThresholdCredits !==
      (existingConfig?.balanceThresholdAwuCredits ?? null);
    if (balanceChanged) {
      const balanceResult = await syncMetronomeBalanceThresholdAlert({
        auth,
        balanceThresholdCredits: resolvedBalanceThresholdCredits,
      });
      if (balanceResult.isErr()) {
        return new Err(balanceResult.error);
      }
    }

    // 3. Default per-user pool limit — only sync when the cap changed.
    if (defaultPoolCapCredits !== currentPoolCapCredits) {
      const poolResult = await setDefaultUserSpendLimit(auth, {
        awuCredits: defaultPoolCapCredits,
        auditContext: POKE_AUDIT_CONTEXT,
      });
      if (poolResult.isErr()) {
        return new Err(poolResult.error);
      }
    }

    // 4. Programmatic monthly cap — only sync when the cap changed.
    if (
      resolvedProgrammaticMonthlyCapCredits !== currentProgrammaticCapCredits
    ) {
      const programmaticResult = await syncProgrammaticUsageLimit({
        auth,
        monthlyCapCredits: resolvedProgrammaticMonthlyCapCredits,
        auditContext: POKE_AUDIT_CONTEXT,
      });
      if (programmaticResult.isErr()) {
        return new Err(programmaticResult.error);
      }
    }

    // 5. Auto-upgrade seats toggle — only update when changed.
    const autoSeatUpgradeChanged =
      autoSeatUpgradeEnabled !==
      (existingConfig?.autoSeatUpgradeEnabled ??
        DEFAULT_AUTO_SEAT_UPGRADE_ENABLED);
    if (autoSeatUpgradeChanged) {
      const toggleResult = await updateUsageConfiguration(auth, {
        autoSeatUpgradeEnabled,
      });
      if (toggleResult.isErr()) {
        return new Err(toggleResult.error);
      }
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
        `Top-up (enterprise): ${topUpEnabled ? "on" : "off"}`,
        `Auto invoice finalization: ${autoInvoiceFinalizationEnabled ? "on" : "off"}`,
      ].join(". "),
    });
  },
});
