import { makeUsageCapSpendLimitAwuCreditsRateLimitKeyForWorkspace } from "@app/lib/api/assistant/rate_limits";
import { passesBillingGate } from "@app/lib/api/credits/auto_seat_upgrade";
import { syncMetronomeBalanceThresholdAlert } from "@app/lib/api/credits/balance_threshold_alert";
import { getEsConsumedWorkspaceAwuCredits } from "@app/lib/api/credits/members_usage";
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
import { resolveSpendLimitCycleBounds } from "@app/lib/spend_limits/cycle";
import type { FixedWindowBounds } from "@app/lib/utils/rate_limiter";
import {
  addFixedWindowCount,
  getFixedWindowCount,
  setFixedWindowCount,
} from "@app/lib/utils/rate_limiter";
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

/**
 * Reads the workspace usage-cap counter, lazily seeding it from Elasticsearch
 * (pool AWU for the current cycle) on a 0 read. Mirrors the other spend-cap
 * lazy seeds. Returns the effective count, or `null` on a Redis read error
 * (caller fails open).
 */
async function readWorkspaceSpendLimitCountWithLazySeed(
  auth: Authenticator,
  { redisKey, bounds }: { redisKey: string; bounds: FixedWindowBounds }
): Promise<number | null> {
  const countResult = await getFixedWindowCount({ key: redisKey, bounds });
  if (countResult.isErr()) {
    return null;
  }
  if (countResult.value > 0) {
    return countResult.value;
  }

  const consumed = await getEsConsumedWorkspaceAwuCredits(auth, {});
  // `null` means the ES read failed (or no cycle) — treat as unknown and skip
  // the seed rather than writing 0 (fail-open read).
  if (consumed === null || consumed <= 0) {
    return 0;
  }
  await setFixedWindowCount({
    key: redisKey,
    bounds,
    value: consumed,
    logger,
  });
  return consumed;
}

/**
 * Synchronous, Metronome-independent enforcement of the workspace usage cap
 * (`usageCapCredits`, the PAYG pool cap), read at message-send time from the
 * Redis fixed-window counter over the current contract billing cycle. Runs
 * alongside the Metronome-driven pool state (`credits_exhausted`) as a faster,
 * independent backup. Returns `false` (does not block) when no cap is
 * configured, no billing period can be resolved, or on a Redis read error
 * (fail-open).
 */
export async function isWorkspaceSpendLimitRateCapReached(
  auth: Authenticator
): Promise<boolean> {
  const workspace = auth.getNonNullableWorkspace();

  const config =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  const threshold = config?.usageCapCredits ?? null;
  if (threshold === null) {
    return false;
  }

  const bounds = await resolveSpendLimitCycleBounds(workspace);
  if (!bounds) {
    return false;
  }

  const count = await readWorkspaceSpendLimitCountWithLazySeed(auth, {
    redisKey:
      makeUsageCapSpendLimitAwuCreditsRateLimitKeyForWorkspace(workspace),
    bounds,
  });
  if (count === null) {
    logger.error(
      { workspaceId: workspace.sId },
      "[WorkspaceSpendLimitRateCap] Failed to read fixed-window count; allowing message"
    );
    return false;
  }

  return count >= threshold;
}

/**
 * Adds `incrementBy` AWU credits to the workspace usage-cap counter for the
 * current contract billing cycle. The caller records only *pool* usage
 * (non-free-seat), matching what `usageCapCredits` measures. No-op when the
 * billing period can't be resolved.
 */
export async function recordWorkspaceSpendLimitUsage(
  auth: Authenticator,
  { incrementBy }: { incrementBy: number }
): Promise<void> {
  // Only whole positive credits are recordable (the counter is an integer
  // INCRBY); skip anything else rather than letting it reach the counter.
  if (!Number.isInteger(incrementBy) || incrementBy <= 0) {
    return;
  }

  const workspace = auth.getNonNullableWorkspace();

  const bounds = await resolveSpendLimitCycleBounds(workspace);
  if (!bounds) {
    return;
  }

  await addFixedWindowCount({
    key: makeUsageCapSpendLimitAwuCreditsRateLimitKeyForWorkspace(workspace),
    bounds,
    incrementBy,
    logger,
  });
}
