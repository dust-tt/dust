import { passesBillingGate } from "@app/lib/api/credits/auto_seat_upgrade";
import { syncMetronomeBalanceThresholdAlert } from "@app/lib/api/credits/balance_threshold_alert";
import type { Authenticator } from "@app/lib/auth";
import { isEnterprisePlanPrefix, isFreePlan } from "@app/lib/plans/plan_codes";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import {
  DEFAULT_ALLOW_MEMBER_UPGRADE_REQUESTS,
  DEFAULT_AUTO_SEAT_UPGRADE_ENABLED,
  DEFAULT_TOP_UP_ENABLED,
  DEFAULT_UPGRADE_REQUEST_EMAIL_ENABLED,
} from "@app/lib/resources/storage/models/credit_usage_configurations";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

// Combined workspace-level usage configuration surfaced to admins on the Usage
// page. All fields are stored on the `credit_usage_configurations` row:
// `balanceThresholdCredits` is the source of truth from which the Metronome
// balance-threshold alert is derived (see `balance_threshold_alert.ts`).
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

/**
 * Read the full usage configuration for a workspace: the balance threshold plus
 * the upgrade-request toggles, all read from the credit-usage configuration row.
 * Toggles fall back to their defaults when no configuration row exists yet.
 */
export async function getUsageConfiguration(
  auth: Authenticator
): Promise<CreditUsageConfigurationBody> {
  const config =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);

  const subscription = auth.subscriptionResource();

  return {
    balanceThresholdCredits: config?.balanceThresholdAwuCredits ?? null,
    allowMemberUpgradeRequests:
      config?.allowMemberUpgradeRequests ??
      DEFAULT_ALLOW_MEMBER_UPGRADE_REQUESTS,
    upgradeRequestEmailEnabled:
      config?.upgradeRequestEmailEnabled ??
      DEFAULT_UPGRADE_REQUEST_EMAIL_ENABLED,
    autoSeatUpgradeEnabled:
      config?.autoSeatUpgradeEnabled ?? DEFAULT_AUTO_SEAT_UPGRADE_ENABLED,
    autoSeatUpgradeAvailable: subscription
      ? passesBillingGate(subscription)
      : false,
    // Free plan workspaces cannot top up. Enterprise workspaces can only top up
    // when the poke-managed flag is explicitly enabled. All other plans can
    // always top up.
    topUpEnabled:
      !isFreePlan(auth.plan()?.code ?? "") &&
      (isEnterprisePlanPrefix(auth.plan()?.code ?? "")
        ? (config?.topUpEnabled ?? DEFAULT_TOP_UP_ENABLED)
        : true),
  };
}

async function setConfigurationToggles(
  auth: Authenticator,
  toggles: {
    allowMemberUpgradeRequests?: boolean;
    upgradeRequestEmailEnabled?: boolean;
    autoSeatUpgradeEnabled?: boolean;
  }
): Promise<Result<undefined, Error>> {
  const config =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  if (config) {
    return config.updateConfiguration(auth, toggles);
  }

  // No configuration row yet — create one carrying the requested toggles, with
  // defaults for the remaining (purchase-related) fields.
  const createResult = await CreditUsageConfigurationResource.makeNew(auth, {
    defaultDiscountPercent: 0,
    usageCapCredits: null,
    allowMemberUpgradeRequests:
      toggles.allowMemberUpgradeRequests ??
      DEFAULT_ALLOW_MEMBER_UPGRADE_REQUESTS,
    upgradeRequestEmailEnabled:
      toggles.upgradeRequestEmailEnabled ??
      DEFAULT_UPGRADE_REQUEST_EMAIL_ENABLED,
    autoSeatUpgradeEnabled:
      toggles.autoSeatUpgradeEnabled ?? DEFAULT_AUTO_SEAT_UPGRADE_ENABLED,
  });
  if (createResult.isErr()) {
    return new Err(createResult.error);
  }

  return new Ok(undefined);
}

/**
 * Persist a partial usage-configuration update. Only the fields present in the
 * patch are touched: `balanceThresholdCredits` syncs the Metronome alert, and
 * the upgrade-request toggles update (or create) the configuration row. Returns
 * the resulting configuration.
 */
export async function updateUsageConfiguration(
  auth: Authenticator,
  patch: PatchCreditUsageConfigurationBody
): Promise<Result<CreditUsageConfigurationBody, Error>> {
  if (patch.balanceThresholdCredits !== undefined) {
    // Normalize 0 to null — both mean "no threshold / warning off".
    const threshold =
      patch.balanceThresholdCredits && patch.balanceThresholdCredits > 0
        ? patch.balanceThresholdCredits
        : null;

    const syncResult = await syncMetronomeBalanceThresholdAlert({
      auth,
      balanceThresholdCredits: threshold,
    });
    if (syncResult.isErr()) {
      return new Err(syncResult.error);
    }
  }

  if (
    patch.allowMemberUpgradeRequests !== undefined ||
    patch.upgradeRequestEmailEnabled !== undefined ||
    patch.autoSeatUpgradeEnabled !== undefined
  ) {
    const toggleResult = await setConfigurationToggles(auth, {
      allowMemberUpgradeRequests: patch.allowMemberUpgradeRequests,
      upgradeRequestEmailEnabled: patch.upgradeRequestEmailEnabled,
      autoSeatUpgradeEnabled: patch.autoSeatUpgradeEnabled,
    });
    if (toggleResult.isErr()) {
      return new Err(toggleResult.error);
    }
  }

  return new Ok(await getUsageConfiguration(auth));
}
