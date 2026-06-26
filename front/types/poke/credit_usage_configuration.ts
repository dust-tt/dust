import { MAX_AWU_DISCOUNT_PERCENT } from "@app/lib/credits/awu_purchase_constants";
import { z } from "zod";

export const MAX_AWU_USAGE_CAP_CREDITS = 2_000_000;

// Shared between the manage-credit-usage-configuration poke plugin and SPA
// forms (e.g. SwitchContractDialog) that pre-populate credit config fields.
export const CreditUsageConfigurationSchema = z.object({
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

export type CreditUsageConfigurationFormValues = z.infer<
  typeof CreditUsageConfigurationSchema
>;
