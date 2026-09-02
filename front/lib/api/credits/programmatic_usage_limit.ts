import { makeProgrammaticSpendLimitAwuCreditsRateLimitKeyForWorkspace } from "@app/lib/api/assistant/rate_limits";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { getEsConsumedProgrammaticAwuCredits } from "@app/lib/api/credits/members_usage";
import { reconcileProgrammatic } from "@app/lib/api/metronome/reconcile_credit_state";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import {
  clearMetronomeProgrammaticCapAlerts,
  upsertMetronomeProgrammaticCapAlerts,
  WARNING_BALANCE_RATIO,
} from "@app/lib/metronome/alerts/programmatic_cap";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { resolveSpendLimitCycleBounds } from "@app/lib/spend_limits/cycle";
import type { FixedWindowBounds } from "@app/lib/utils/rate_limiter";
import {
  addFixedWindowCount,
  readFixedWindowCountWithLazySeed,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Read the workspace's programmatic usage monthly cap.
 *
 * The cap is persisted on `credit_usage_configurations` (the source of truth);
 * the Metronome programmatic alerts are derived enforcement. The cap is
 * non-nullable and defaults to 0 (0 blocks all programmatic access), so a
 * workspace with no configuration row reads as 0.
 */
export async function getProgrammaticUsageLimit(
  auth: Authenticator
): Promise<Result<number, Error>> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return new Err(
      new Error(`Workspace ${workspace.sId} has no Metronome customer ID.`)
    );
  }

  const config =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  return new Ok(config?.programmaticMonthlyCapAwuCredits ?? 0);
}

/**
 * Set the workspace's programmatic usage monthly cap.
 *
 * Persists the cap on `credit_usage_configurations` (the source of truth),
 * then derives the Metronome programmatic alerts from it (only for positive
 * caps; a cap of 0 clears the alerts since it is always depleted — no
 * threshold transition can ever fire), and finally reconciles
 * `programmaticCreditState` so usage-status reflects the change immediately
 * without waiting for a webhook.
 *
 * The cap is non-nullable: 0 blocks all programmatic access, a positive value
 * is the monthly cap. Negative inputs are clamped to 0.
 */
export async function syncProgrammaticUsageLimit({
  auth,
  monthlyCapCredits,
  auditContext,
}: {
  auth: Authenticator;
  monthlyCapCredits: number;
  auditContext?: AuditLogContext;
}): Promise<Result<undefined, Error>> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return new Err(
      new Error(`Workspace ${workspace.sId} has no Metronome customer ID.`)
    );
  }

  // Persist the admin's intent first: the credit-usage configuration column is
  // the source of truth; the Metronome alerts below are derived enforcement (a
  // failed sync can be retried and re-derives from this value). The config row
  // is created lazily, so upsert it. Negative inputs are clamped to 0.
  const normalizedCapCredits = Math.max(0, monthlyCapCredits);
  const existingConfig =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  const previousCapCredits =
    existingConfig?.programmaticMonthlyCapAwuCredits ?? 0;
  if (existingConfig) {
    await existingConfig.updateConfiguration(auth, {
      programmaticMonthlyCapAwuCredits: normalizedCapCredits,
    });
  } else {
    await CreditUsageConfigurationResource.makeNew(auth, {
      defaultDiscountPercent: 0,
      usageCapCredits: null,
      programmaticMonthlyCapAwuCredits: normalizedCapCredits,
    });
  }

  // Alerts only make sense for a positive cap: a cap of 0 means usage is
  // always fully depleted, so no threshold transition can ever fire.
  const alertResult =
    normalizedCapCredits > 0
      ? await upsertMetronomeProgrammaticCapAlerts({
          metronomeCustomerId: workspace.metronomeCustomerId,
          workspaceId: workspace.sId,
          monthlyCapCredits: normalizedCapCredits,
        })
      : await clearMetronomeProgrammaticCapAlerts({
          metronomeCustomerId: workspace.metronomeCustomerId,
          workspaceId: workspace.sId,
        });
  if (alertResult.isErr()) {
    return new Err(
      new Error(
        `Failed to sync Metronome programmatic cap alerts: ${alertResult.error.message}`
      )
    );
  }

  // Reconcile programmaticCreditState immediately so /usage-status reflects the
  // change without waiting for a Metronome webhook.
  const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
  if (workspaceResource) {
    await reconcileProgrammatic({
      workspace: workspaceResource,
      metronomeCustomerId: workspace.metronomeCustomerId,
      metronomeContractId: auth.subscription()?.metronomeContractId ?? null,
      execute: true,
    });
  }

  void emitAuditLogEvent({
    auth,
    action: "workspace.programmatic_usage_limit_updated",
    targets: [buildAuditLogTarget("workspace", workspace)],
    context: auditContext,
    metadata: {
      previous_monthly_cap_credits: String(previousCapCredits),
      new_monthly_cap_credits: String(normalizedCapCredits),
    },
  });

  return new Ok(undefined);
}

/**
 * Reads the workspace programmatic spend-cap counter, lazily seeding it from
 * Elasticsearch (programmatic-only AWU for the current cycle) on a 0 read.
 * Mirrors the per-user / per-key lazy seed. Returns the effective count, or
 * `null` on a Redis read error (caller fails open).
 */
async function readProgrammaticSpendLimitCountWithLazySeed(
  auth: Authenticator,
  { redisKey, bounds }: { redisKey: string; bounds: FixedWindowBounds }
): Promise<number | null> {
  return readFixedWindowCountWithLazySeed({
    key: redisKey,
    bounds,
    logger,
    // The counter stores microCredits; convert the ES credit value before
    // seeding. Preserve the null contract (ES read failed → skip seed, do not
    // seed as 0).
    fetchSeedValue: async () => {
      const consumedAwuCredits = await getEsConsumedProgrammaticAwuCredits(
        auth,
        {}
      );
      return consumedAwuCredits === null
        ? null
        : roundCreditsToMicroCredits(consumedAwuCredits);
    },
  });
}

/**
 * Synchronous, Metronome-independent enforcement of the workspace programmatic
 * spend cap, read at message-send time from the Redis fixed-window counter over
 * the current contract billing cycle. Runs alongside the Metronome-driven
 * `isProgrammaticApiBlocked` as a faster, independent backup.
 *
 * Only enforces a *positive* cap: a cap of 0 means "always depleted", which is
 * owned by the programmatic credit-state machine (`isProgrammaticApiBlocked`),
 * not a threshold — so the backup defers to it there. Returns `false` (does not
 * block) with no positive cap, no billing period, or on a Redis read error
 * (fail-open).
 */
export async function isProgrammaticSpendLimitRateCapReached(
  auth: Authenticator
): Promise<boolean> {
  return isProgrammaticSpendLimitRateThresholdReached(auth, { ratio: 1 });
}

/**
 * "Near limit" (soft warning) counterpart of
 * `isProgrammaticSpendLimitRateCapReached`: the same Redis fixed-window counter
 * compared against `WARNING_BALANCE_RATIO` (80%) of the monthly cap instead of
 * the full cap. Rate-limiter counterpart of the Metronome-driven
 * `isWorkspaceProgrammaticWarningReached`. Returns `false` with no positive cap,
 * no billing period, or on a Redis read error (fail-open).
 */
export async function isProgrammaticSpendLimitRateWarningReached(
  auth: Authenticator
): Promise<boolean> {
  return isProgrammaticSpendLimitRateThresholdReached(auth, {
    ratio: WARNING_BALANCE_RATIO,
  });
}

/**
 * Reads the workspace programmatic spend-cap counter over the current contract
 * billing cycle and compares it against `ratio × monthly cap`. Only enforces a
 * *positive* cap: a cap of 0 means "always depleted", owned by the programmatic
 * credit-state machine (`isProgrammaticApiBlocked`), so this defers there.
 * Returns `false` with no positive cap, no billing period, or on a Redis read
 * error (fail-open).
 */
async function isProgrammaticSpendLimitRateThresholdReached(
  auth: Authenticator,
  { ratio }: { ratio: number }
): Promise<boolean> {
  const workspace = auth.getNonNullableWorkspace();

  const config =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  const cap = config?.programmaticMonthlyCapAwuCredits ?? 0;
  if (cap <= 0) {
    return false;
  }

  const bounds = await resolveSpendLimitCycleBounds(workspace);
  if (!bounds) {
    return false;
  }

  const count = await readProgrammaticSpendLimitCountWithLazySeed(auth, {
    redisKey:
      makeProgrammaticSpendLimitAwuCreditsRateLimitKeyForWorkspace(workspace),
    bounds,
  });
  if (count === null) {
    logger.error(
      { workspaceId: workspace.sId },
      "[ProgrammaticSpendLimitRateCap] Failed to read fixed-window count; allowing message"
    );
    return false;
  }

  // The counter stores microCredits; scale the credit threshold up so the
  // comparison stays integer-on-integer.
  return count >= roundCreditsToMicroCredits(cap * ratio);
}

/**
 * Adds `incrementBy` AWU credits to the workspace programmatic spend-cap counter
 * for the current contract billing cycle. Records for every workspace (the cap
 * is resolved at enforcement/read time, not here). `incrementBy` is the
 * newly-accrued delta for a message. No-op when the billing period can't be
 * resolved.
 */
export async function recordProgrammaticSpendLimitUsage(
  auth: Authenticator,
  { incrementBy }: { incrementBy: number }
): Promise<void> {
  // Credits may be fractional; the counter stores microCredits (integer
  // INCRBY), so convert before recording. A non-positive or non-finite delta is
  // a normal no-op (e.g. a retry with no new usage) and stays silent.
  if (!Number.isFinite(incrementBy) || incrementBy <= 0) {
    return;
  }

  const workspace = auth.getNonNullableWorkspace();

  const bounds = await resolveSpendLimitCycleBounds(workspace);
  if (!bounds) {
    return;
  }

  const redisKey =
    makeProgrammaticSpendLimitAwuCreditsRateLimitKeyForWorkspace(workspace);

  // Seed from ES on the counter's first touch of the cycle (SET-if-absent), so
  // it reflects cycle-to-date consumption even when the enforcement reader
  // never runs (e.g. no positive programmatic cap). No-ops once live.
  await readProgrammaticSpendLimitCountWithLazySeed(auth, { redisKey, bounds });

  const incrementByMicroCredits = roundCreditsToMicroCredits(incrementBy);

  await addFixedWindowCount({
    key: redisKey,
    bounds,
    incrementBy: incrementByMicroCredits,
    logger,
  });
}
