import { passesBillingGate } from "@app/lib/api/credits/auto_seat_upgrade";
import { syncMetronomeBalanceThresholdAlert } from "@app/lib/api/credits/balance_threshold_alert";
import { syncMetronomeSeatCountForWorkspace } from "@app/lib/api/metronome/seat_sync";
import type { Authenticator } from "@app/lib/auth";
import { isEnterprisePlanPrefix, isFreePlan } from "@app/lib/plans/plan_codes";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import {
  DEFAULT_ALLOW_MEMBER_UPGRADE_REQUESTS,
  DEFAULT_AUTO_SEAT_UPGRADE_ENABLED,
  DEFAULT_TOP_UP_ENABLED,
  DEFAULT_UPGRADE_REQUEST_EMAIL_ENABLED,
} from "@app/lib/resources/storage/models/credit_usage_configurations";
import logger from "@app/logger/logger";
import type {
  CreditUsageConfigurationBody,
  PatchCreditUsageConfigurationBody,
} from "@app/types/api/credits/usage_configuration";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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

  // Detect a false→true transition of the auto-upgrade toggle: enabling it is
  // the one moment we reconcile the *whole* workspace (rather than per seat
  // transition), so every member lands in the correct seat↔pool credit state
  // under the new policy.
  const enablingAutoSeatUpgrade =
    patch.autoSeatUpgradeEnabled === true &&
    !(await getUsageConfiguration(auth)).autoSeatUpgradeEnabled;

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

  if (enablingAutoSeatUpgrade) {
    // Best-effort: a failure here must not fail the configuration update.
    const reconcileResult = await syncMetronomeSeatCountForWorkspace({
      workspace: auth.getNonNullableWorkspace(),
    });
    if (reconcileResult.isErr()) {
      logger.warn(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          err: reconcileResult.error.message,
        },
        "[UsageConfiguration] Whole-workspace reconcile after enabling auto-upgrade failed"
      );
    }
  }

  return new Ok(await getUsageConfiguration(auth));
}
