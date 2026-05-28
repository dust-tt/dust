import {
  clearMetronomeAlert,
  findMetronomeAlert,
  upsertMetronomeAlert,
} from "@app/lib/metronome/alerts";
import { listMetronomeAlerts } from "@app/lib/metronome/client";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import {
  bestEffortInvalidateCacheWithRedis,
  cacheWithRedis,
} from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { CustomerAlert } from "@metronome/sdk/resources/v1/customers";

const USER_ID_GROUP_KEY = "user_id";

// The warning alert fires at this fraction of the cap, giving users advance
// notice before they are hard-blocked at 100%.
export const USER_AWU_WARNING_PERCENTAGE = 0.8;

function warningAwuCredits(capAwuCredits: number): number {
  return Math.floor(capAwuCredits * USER_AWU_WARNING_PERCENTAGE);
}

function defaultUserCapAlertUniquenessKey(workspaceId: string): string {
  return `default-user-cap-${workspaceId}`;
}

function perUserAlertUniquenessKeyPrefix(workspaceId: string): string {
  return `per-user-cap-${workspaceId}-`;
}

function perUserAlertUniquenessKey(
  workspaceId: string,
  userId: string
): string {
  return `${perUserAlertUniquenessKeyPrefix(workspaceId)}${userId}`;
}

function defaultUserWarningAlertUniquenessKey(workspaceId: string): string {
  return `default-user-warning-${workspaceId}`;
}

function perUserWarningAlertUniquenessKeyPrefix(workspaceId: string): string {
  return `per-user-warning-${workspaceId}-`;
}

function perUserWarningAlertUniquenessKey(
  workspaceId: string,
  userId: string
): string {
  return `${perUserWarningAlertUniquenessKeyPrefix(workspaceId)}${userId}`;
}

/**
 * Look up the workspace-wide default per-user cap alert. Returns the alert
 * id, threshold and current Metronome evaluation state, or `null` if no
 * default cap has been configured yet.
 *
 * The default alert is fanned out per `user_id` by Metronome: it uses
 * `group_values: [{ key: "user_id" }]` with no value, so a single alert
 * configuration produces per-user `reached` / `resolved` events.
 */
export async function getMetronomeDefaultUserCapAlert({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Result<CustomerAlert | null, Error>> {
  return findMetronomeAlert({
    metronomeCustomerId,
    uniquenessKey: defaultUserCapAlertUniquenessKey(workspaceId),
  });
}

/**
 * Idempotently ensure a workspace-wide default per-user cap alert exists on
 * the customer, with the given AWU threshold. If an alert with a different
 * threshold already exists, it's archived (with key release) and recreated.
 *
 * Fan-out: `group_values: [{ key: "user_id" }]` with no value — Metronome
 * fires one `reached` / `resolved` event per user that crosses the threshold,
 * with that user's id populated in `group_values[].value`.
 */
export async function upsertMetronomeDefaultUserCapAlert({
  metronomeCustomerId,
  workspaceId,
  awuCredits,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  awuCredits: number;
}): Promise<Result<{ alertId: string }, Error>> {
  const upsertResult = await upsertMetronomeAlert({
    alert_type: "spend_threshold_reached",
    name: `Default per-user cap ${workspaceId} (${awuCredits} AWU)`,
    threshold: awuCredits,
    credit_type_id: getCreditTypeAwuId(),
    customer_id: metronomeCustomerId,
    group_values: [{ key: USER_ID_GROUP_KEY }],
    uniqueness_key: defaultUserCapAlertUniquenessKey(workspaceId),
  });
  if (upsertResult.isErr()) {
    return new Err(upsertResult.error);
  }

  logger.info(
    {
      workspaceId,
      metronomeCustomerId,
      alertId: upsertResult.value.alertId,
      awuCredits,
    },
    "[Metronome DefaultUserCap] Synced default per-user cap alert"
  );
  await invalidateCachedDefaultCapThreshold({
    metronomeCustomerId,
    workspaceId,
  });
  return new Ok({ alertId: upsertResult.value.alertId });
}

/**
 * Look up the current per-user cap (if any) for a workspace/user pair by
 * matching `uniqueness_key`. Returns the alert id, threshold and current
 * Metronome evaluation state, or `null` if no cap is configured.
 */
export async function getMetronomePerUserCap({
  metronomeCustomerId,
  workspaceId,
  userId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  userId: string;
}): Promise<Result<CustomerAlert | null, Error>> {
  return findMetronomeAlert({
    metronomeCustomerId,
    uniquenessKey: perUserAlertUniquenessKey(workspaceId, userId),
  });
}

/**
 * List per-user caps for a workspace. Returns a `Map<userId, CustomerAlert>`
 * built from all enabled alerts whose `uniqueness_key` matches the per-user
 * cap pattern for this workspace.
 */
export async function listMetronomePerUserCapsForWorkspace({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Result<Map<string, CustomerAlert>, Error>> {
  const prefix = perUserAlertUniquenessKeyPrefix(workspaceId);
  const caps = new Map<string, CustomerAlert>();
  try {
    for await (const entry of listMetronomeAlerts({
      customer_id: metronomeCustomerId,
      alert_statuses: ["ENABLED"],
    })) {
      const key = entry.alert.uniqueness_key;
      if (!key || !key.startsWith(prefix)) {
        continue;
      }
      const userId = key.slice(prefix.length);
      if (!userId) {
        continue;
      }
      caps.set(userId, entry);
    }
    return new Ok(caps);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

const SPEND_LIMIT_CACHE_TTL_MS = 60 * 1000;

const spendLimitCacheResolver = ({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}) => `${metronomeCustomerId}-${workspaceId}`;

async function fetchPerUserCapThresholds(args: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Record<string, number>> {
  const result = await listMetronomePerUserCapsForWorkspace(args);
  if (result.isErr()) {
    throw result.error;
  }
  const thresholds: Record<string, number> = {};
  for (const [userId, entry] of result.value) {
    thresholds[userId] = entry.alert.threshold;
  }
  return thresholds;
}

export const getCachedPerUserCapThresholds = cacheWithRedis(
  fetchPerUserCapThresholds,
  spendLimitCacheResolver,
  { ttlMs: SPEND_LIMIT_CACHE_TTL_MS }
);

const invalidateCachedPerUserCapThresholds = bestEffortInvalidateCacheWithRedis(
  fetchPerUserCapThresholds,
  spendLimitCacheResolver,
  "members-usage per-user spend caps"
);

async function fetchDefaultCapThreshold(args: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<{ threshold: number | null }> {
  const result = await getMetronomeDefaultUserCapAlert(args);
  if (result.isErr()) {
    throw result.error;
  }
  return { threshold: result.value?.alert.threshold ?? null };
}

export const getCachedDefaultCapThreshold = cacheWithRedis(
  fetchDefaultCapThreshold,
  spendLimitCacheResolver,
  { ttlMs: SPEND_LIMIT_CACHE_TTL_MS }
);

const invalidateCachedDefaultCapThreshold = bestEffortInvalidateCacheWithRedis(
  fetchDefaultCapThreshold,
  spendLimitCacheResolver,
  "members-usage default spend cap"
);

/**
 * Idempotently ensure a Metronome `spend_threshold_reached` alert exists on
 * the customer for this user, with the given AWU threshold. If an alert
 * with a different threshold already exists, it's archived (with key
 * release) and recreated.
 */
export async function upsertMetronomePerUserCapAlert({
  metronomeCustomerId,
  workspaceId,
  userId,
  awuCredits,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  userId: string;
  awuCredits: number;
}): Promise<Result<{ alertId: string }, Error>> {
  const upsertResult = await upsertMetronomeAlert({
    alert_type: "spend_threshold_reached",
    name: `Per-user cap ${workspaceId}-${userId} (${awuCredits} AWU)`,
    threshold: awuCredits,
    credit_type_id: getCreditTypeAwuId(),
    customer_id: metronomeCustomerId,
    group_values: [{ key: USER_ID_GROUP_KEY, value: userId }],
    uniqueness_key: perUserAlertUniquenessKey(workspaceId, userId),
  });
  if (upsertResult.isErr()) {
    return new Err(upsertResult.error);
  }

  logger.info(
    {
      workspaceId,
      userId,
      metronomeCustomerId,
      alertId: upsertResult.value.alertId,
      awuCredits,
    },
    "[Metronome PerUserCap] Synced per-user cap alert"
  );
  await invalidateCachedPerUserCapThresholds({
    metronomeCustomerId,
    workspaceId,
  });
  return new Ok({ alertId: upsertResult.value.alertId });
}

/**
 * Archive the per-user cap alert for this workspace/user pair, if any.
 * Idempotent — no-op when no matching alert exists.
 */
export async function clearMetronomePerUserCapAlert({
  metronomeCustomerId,
  workspaceId,
  userId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  userId: string;
}): Promise<Result<void, Error>> {
  const result = await clearMetronomeAlert({
    metronomeCustomerId,
    uniquenessKey: perUserAlertUniquenessKey(workspaceId, userId),
  });
  if (result.isErr()) {
    return new Err(result.error);
  }

  if (result.value) {
    logger.info(
      {
        workspaceId,
        userId,
        metronomeCustomerId,
        alertId: result.value.alertId,
      },
      "[Metronome PerUserCap] Cleared per-user cap alert"
    );
  }
  await invalidateCachedPerUserCapThresholds({
    metronomeCustomerId,
    workspaceId,
  });
  return new Ok(undefined);
}

// ============================================================================
// 80% warning alerts — same shape as cap alerts, but at USER_AWU_WARNING_PERCENTAGE
// of the cap. They fire before the hard block to give users advance notice.
// ============================================================================

/**
 * Look up the workspace-wide default per-user 80% warning alert.
 */
export async function getMetronomeDefaultUserWarningAlert({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Result<CustomerAlert | null, Error>> {
  return findMetronomeAlert({
    metronomeCustomerId,
    uniquenessKey: defaultUserWarningAlertUniquenessKey(workspaceId),
  });
}

/**
 * Idempotently ensure a workspace-wide default per-user 80% warning alert
 * exists. The threshold is floor(capAwuCredits * 0.8). Skipped if the result
 * would be zero.
 */
export async function upsertMetronomeDefaultUserWarningAlert({
  metronomeCustomerId,
  workspaceId,
  capAwuCredits,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  capAwuCredits: number;
}): Promise<Result<{ alertId: string } | null, Error>> {
  const threshold = warningAwuCredits(capAwuCredits);
  if (threshold <= 0) {
    return new Ok(null);
  }
  const upsertResult = await upsertMetronomeAlert({
    alert_type: "spend_threshold_reached",
    name: `Default per-user warning ${workspaceId} (${threshold} AWU / ${Math.round(USER_AWU_WARNING_PERCENTAGE * 100)}% of ${capAwuCredits})`,
    threshold,
    credit_type_id: getCreditTypeAwuId(),
    customer_id: metronomeCustomerId,
    group_values: [{ key: USER_ID_GROUP_KEY }],
    uniqueness_key: defaultUserWarningAlertUniquenessKey(workspaceId),
  });
  if (upsertResult.isErr()) {
    return new Err(upsertResult.error);
  }
  logger.info(
    {
      workspaceId,
      metronomeCustomerId,
      alertId: upsertResult.value.alertId,
      threshold,
      capAwuCredits,
    },
    "[Metronome DefaultUserWarning] Synced default per-user warning alert"
  );
  return new Ok({ alertId: upsertResult.value.alertId });
}

/**
 * Look up the per-user 80% warning alert for a specific user.
 */
export async function getMetronomePerUserWarningAlert({
  metronomeCustomerId,
  workspaceId,
  userId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  userId: string;
}): Promise<Result<CustomerAlert | null, Error>> {
  return findMetronomeAlert({
    metronomeCustomerId,
    uniquenessKey: perUserWarningAlertUniquenessKey(workspaceId, userId),
  });
}

/**
 * Idempotently ensure a per-user 80% warning alert exists for this
 * workspace/user pair. The threshold is floor(capAwuCredits * 0.8).
 */
export async function upsertMetronomePerUserWarningAlert({
  metronomeCustomerId,
  workspaceId,
  userId,
  capAwuCredits,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  userId: string;
  capAwuCredits: number;
}): Promise<Result<{ alertId: string } | null, Error>> {
  const threshold = warningAwuCredits(capAwuCredits);
  if (threshold <= 0) {
    return new Ok(null);
  }
  const upsertResult = await upsertMetronomeAlert({
    alert_type: "spend_threshold_reached",
    name: `Per-user warning ${workspaceId}-${userId} (${threshold} AWU / ${Math.round(USER_AWU_WARNING_PERCENTAGE * 100)}% of ${capAwuCredits})`,
    threshold,
    credit_type_id: getCreditTypeAwuId(),
    customer_id: metronomeCustomerId,
    group_values: [{ key: USER_ID_GROUP_KEY, value: userId }],
    uniqueness_key: perUserWarningAlertUniquenessKey(workspaceId, userId),
  });
  if (upsertResult.isErr()) {
    return new Err(upsertResult.error);
  }
  logger.info(
    {
      workspaceId,
      userId,
      metronomeCustomerId,
      alertId: upsertResult.value.alertId,
      threshold,
      capAwuCredits,
    },
    "[Metronome PerUserWarning] Synced per-user warning alert"
  );
  return new Ok({ alertId: upsertResult.value.alertId });
}

/**
 * Archive the per-user warning alert for this workspace/user pair, if any.
 * Idempotent — no-op when no matching alert exists.
 */
export async function clearMetronomePerUserWarningAlert({
  metronomeCustomerId,
  workspaceId,
  userId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  userId: string;
}): Promise<Result<void, Error>> {
  const result = await clearMetronomeAlert({
    metronomeCustomerId,
    uniquenessKey: perUserWarningAlertUniquenessKey(workspaceId, userId),
  });
  if (result.isErr()) {
    return new Err(result.error);
  }
  if (result.value) {
    logger.info(
      {
        workspaceId,
        userId,
        metronomeCustomerId,
        alertId: result.value.alertId,
      },
      "[Metronome PerUserWarning] Cleared per-user warning alert"
    );
  }
  return new Ok(undefined);
}
