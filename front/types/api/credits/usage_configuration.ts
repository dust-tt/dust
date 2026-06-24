import { z } from "zod";

export type CreditUsageConfigurationBody = {
  // Credit balance (in AWU credits) below which workspace admins are emailed.
  // `null` means no threshold is configured (the warning is off).
  balanceThresholdCredits: number | null;
  // Whether non-admin members who reach their per-user spend limit can request a
  // spend-limit upgrade from the product.
  allowMemberUpgradeRequests: boolean;
  // Whether workspace admins are emailed when a member requests an upgrade.
  upgradeRequestEmailEnabled: boolean;
  // Whether members who hit their per-user credit limit are automatically bumped
  // to the next entitled seat tier instead of being blocked.
  autoSeatUpgradeEnabled: boolean;
  autoSeatUpgradeAvailable: boolean;
  // Whether enterprise-plan workspaces show the "Top up" button on the Usage page.
  topUpEnabled: boolean;
};

export type GetCreditUsageConfigurationResponseBody = {
  configuration: CreditUsageConfigurationBody;
};

export type PatchCreditUsageConfigurationResponseBody = {
  configuration: CreditUsageConfigurationBody;
};

export const PatchCreditUsageConfigurationRequestBody = z.object({
  // 0 (or null) clears the threshold; a positive value enables the alert.
  balanceThresholdCredits: z.number().int().min(0).nullable().optional(),
  allowMemberUpgradeRequests: z.boolean().optional(),
  upgradeRequestEmailEnabled: z.boolean().optional(),
  autoSeatUpgradeEnabled: z.boolean().optional(),
});

export type PatchCreditUsageConfigurationBody = z.infer<
  typeof PatchCreditUsageConfigurationRequestBody
>;
