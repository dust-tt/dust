import {
  baseUniquenessKey,
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
import type { NormalizedPoolLimitSeatType } from "@app/types/memberships";
import { NORMALIZED_POOL_LIMIT_SEAT_TYPES } from "@app/types/memberships";
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

// Per-seat-type default alert uniqueness keys.
function defaultUserCapAlertUniquenessKeyForSeatType(
  seatType: NormalizedPoolLimitSeatType,
  workspaceId: string
): string {
  return `${DEFAULT_USER_CAP_ALERT_KEY_PREFIX}${seatType}-${workspaceId}`;
}

function defaultUserWarningAlertUniquenessKeyForSeatType(
  seatType: NormalizedPoolLimitSeatType,
  workspaceId: string
): string {
  return `${DEFAULT_USER_WARNING_ALERT_KEY_PREFIX}${seatType}-${workspaceId}`;
}

function perUserAlertUniquenessKeyPrefix(workspaceId: string): string {
  return `per-user-cap-${workspaceId}-`;
}

function perUserWarningAlertUniquenessKeyPrefix(workspaceId: string): string {
  return `per-user-warning-${workspaceId}-`;
}

// Prefixes for the per-seat-type default and per-group cap/warning alert
// uniqueness keys. Unlike the per-user keys, these carry the workspace id as
// their final `-<workspaceId>` segment. Kept as the single source of truth for
// `isUnusedSpendCapAlertUniquenessKey` below (the default builders append the
// seat type; the group builders were removed with their now-unused writers).
const DEFAULT_USER_CAP_ALERT_KEY_PREFIX = "default-user-cap-";
const DEFAULT_USER_WARNING_ALERT_KEY_PREFIX = "default-user-warning-";
const GROUP_CAP_ALERT_KEY_PREFIX = "group-cap-";
const GROUP_WARNING_ALERT_KEY_PREFIX = "group-warning-";

/**
 * True when `uniquenessKey` (a base key with any generation suffix already
 * stripped) identifies one of the per-user, per-seat-type default, or per-group
 * spend-cap / warning alerts for `workspaceId`. These alerts are no longer used
 * for enforcement (the caps are read from the Redis rate-limiter counter against
 * the DB-persisted values), so the archive script uses this to select them for
 * deletion.
 *
 * Does NOT match the free-seat per-user credit-balance alerts
 * (`per-user-credit-*`) or the workspace balance-threshold alert
 * (`workspace-balance-threshold-*`), which are still in use.
 */
export function isUnusedSpendCapAlertUniquenessKey(
  uniquenessKey: string,
  workspaceId: string
): boolean {
  // Per-user cap / warning: workspace id is embedded in the prefix, followed by
  // the user id.
  if (
    uniquenessKey.startsWith(perUserAlertUniquenessKeyPrefix(workspaceId)) ||
    uniquenessKey.startsWith(
      perUserWarningAlertUniquenessKeyPrefix(workspaceId)
    )
  ) {
    return true;
  }

  // Per-seat-type default and per-group cap / warning: the workspace id is the
  // final `-<workspaceId>` segment.
  if (!uniquenessKey.endsWith(`-${workspaceId}`)) {
    return false;
  }
  return (
    uniquenessKey.startsWith(DEFAULT_USER_CAP_ALERT_KEY_PREFIX) ||
    uniquenessKey.startsWith(DEFAULT_USER_WARNING_ALERT_KEY_PREFIX) ||
    uniquenessKey.startsWith(GROUP_CAP_ALERT_KEY_PREFIX) ||
    uniquenessKey.startsWith(GROUP_WARNING_ALERT_KEY_PREFIX)
  );
}

/**
 * Look up the per-seat-type default per-user cap alert. Returns the alert
 * id, threshold and current Metronome evaluation state, or `null` if no
 * cap has been configured for this seat type.
 *
 * Each seat type has its own alert with threshold = seatAllowance + poolLimit.
 * Fan-out: `group_values: [{ key: "user_id" }]` with no value — Metronome
 * fires per-user `reached` / `resolved` events.
 */
export async function getMetronomeDefaultUserCapAlertForSeatType({
  metronomeCustomerId,
  workspaceId,
  seatType,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  seatType: NormalizedPoolLimitSeatType;
}): Promise<Result<CustomerAlert | null, Error>> {
  return findMetronomeAlert({
    metronomeCustomerId,
    uniquenessKey: defaultUserCapAlertUniquenessKeyForSeatType(
      seatType,
      workspaceId
    ),
  });
}

/**
 * Idempotently ensure a per-seat-type default per-user cap alert exists on
 * the customer, with the given AWU threshold (seatAllowance + poolLimit,
 * computed by the caller). If an alert with a different threshold already
 * exists, it's archived (with key release) and recreated.
 */
export async function upsertMetronomeDefaultUserCapAlertForSeatType({
  metronomeCustomerId,
  workspaceId,
  seatType,
  awuCredits,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  seatType: NormalizedPoolLimitSeatType;
  awuCredits: number;
}): Promise<Result<{ alertId: string }, Error>> {
  const upsertResult = await upsertMetronomeAlert({
    alert_type: "spend_threshold_reached",
    name: `Default per-user cap ${seatType} ${workspaceId} (${awuCredits} AWU)`,
    threshold: awuCredits,
    credit_type_id: getCreditTypeAwuId(),
    customer_id: metronomeCustomerId,
    group_values: [{ key: USER_ID_GROUP_KEY }],
    uniqueness_key: defaultUserCapAlertUniquenessKeyForSeatType(
      seatType,
      workspaceId
    ),
  });
  if (upsertResult.isErr()) {
    return new Err(upsertResult.error);
  }

  logger.info(
    {
      workspaceId,
      seatType,
      metronomeCustomerId,
      alertId: upsertResult.value.alertId,
      awuCredits,
    },
    "[Metronome DefaultUserCap] Synced per-seat-type default per-user cap alert"
  );
  await invalidateCachedDefaultCapThresholdsBySeatType({
    metronomeCustomerId,
    workspaceId,
  });
  return new Ok({ alertId: upsertResult.value.alertId });
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
      if (!key) {
        continue;
      }
      const baseKey = baseUniquenessKey(key);
      if (!baseKey.startsWith(prefix)) {
        continue;
      }
      const userId = baseKey.slice(prefix.length);
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

// A resolved per-user / per-seat-type cap: the AWU threshold, the id of the
// backing Metronome cap alert, and the id of its companion 80% warning alert
// (so callers can deep-link to both). `warningAlertId` is null when no warning
// alert exists.
export type MetronomeCapAlertInfo = {
  threshold: number;
  alertId: string;
  warningAlertId: string | null;
};

// The Metronome alert ids backing a per-user cap override, for dashboard deep
// links. Intentionally carries no threshold: the cap value lives on the
// membership (`poolCapOverrideAwuCredits`), and the alert's threshold can lag
// it (e.g. after a seat-type change) until the next override write re-syncs.
export type MetronomeCapAlertIds = {
  alertId: string;
  warningAlertId: string | null;
};

async function fetchPerUserCapAlertIds(args: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Record<string, MetronomeCapAlertIds>> {
  const capPrefix = perUserAlertUniquenessKeyPrefix(args.workspaceId);
  const warningPrefix = perUserWarningAlertUniquenessKeyPrefix(
    args.workspaceId
  );

  const capIdByUser = new Map<string, string>();
  const warningIdByUser = new Map<string, string>();

  // Single scan: the per-user cap and its 80% warning share the customer alert
  // list, so match both prefixes in one pass instead of two list calls.
  try {
    for await (const entry of listMetronomeAlerts({
      customer_id: args.metronomeCustomerId,
      alert_statuses: ["ENABLED"],
    })) {
      const rawKey = entry.alert.uniqueness_key;
      if (!rawKey) {
        continue;
      }
      const key = baseUniquenessKey(rawKey);
      if (key.startsWith(capPrefix)) {
        const userId = key.slice(capPrefix.length);
        if (userId) {
          capIdByUser.set(userId, entry.alert.id);
        }
      } else if (key.startsWith(warningPrefix)) {
        const userId = key.slice(warningPrefix.length);
        if (userId) {
          warningIdByUser.set(userId, entry.alert.id);
        }
      }
    }
  } catch (err) {
    throw normalizeError(err);
  }

  const caps: Record<string, MetronomeCapAlertIds> = {};
  for (const [userId, alertId] of capIdByUser) {
    caps[userId] = {
      alertId,
      warningAlertId: warningIdByUser.get(userId) ?? null,
    };
  }
  return caps;
}

export const getCachedPerUserCapAlertIds = cacheWithRedis(
  fetchPerUserCapAlertIds,
  spendLimitCacheResolver,
  { ttlMs: SPEND_LIMIT_CACHE_TTL_MS }
);

/**
 * Fetch the default cap thresholds for all seat types configured on this
 * workspace. Returns a map of `NormalizedPoolLimitSeatType → totalThreshold`
 * (seatAllowance + poolLimit). Empty record when no per-seat-type alerts exist.
 */
async function fetchDefaultCapThresholdsBySeatType(args: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Record<NormalizedPoolLimitSeatType, MetronomeCapAlertInfo>> {
  const capKeyToSeat = new Map<string, NormalizedPoolLimitSeatType>();
  const warningKeyToSeat = new Map<string, NormalizedPoolLimitSeatType>();
  for (const seatType of NORMALIZED_POOL_LIMIT_SEAT_TYPES) {
    capKeyToSeat.set(
      defaultUserCapAlertUniquenessKeyForSeatType(seatType, args.workspaceId),
      seatType
    );
    warningKeyToSeat.set(
      defaultUserWarningAlertUniquenessKeyForSeatType(
        seatType,
        args.workspaceId
      ),
      seatType
    );
  }

  const capBySeat = new Map<
    NormalizedPoolLimitSeatType,
    { threshold: number; alertId: string; enabled: boolean }
  >();
  const warningIdBySeat = new Map<NormalizedPoolLimitSeatType, string>();

  // Single scan: match every per-seat-type default cap and 80% warning alert in
  // one pass instead of two `findMetronomeAlert` lookups per seat type.
  try {
    for await (const entry of listMetronomeAlerts({
      customer_id: args.metronomeCustomerId,
      alert_statuses: ["ENABLED", "DISABLED"],
    })) {
      const rawKey = entry.alert.uniqueness_key;
      if (!rawKey) {
        continue;
      }
      const key = baseUniquenessKey(rawKey);
      const enabled = entry.alert.status === "enabled";
      const capSeat = capKeyToSeat.get(key);
      if (capSeat) {
        // Prefer an enabled generation over a disabled one for the same seat.
        const current = capBySeat.get(capSeat);
        if (!current || (enabled && !current.enabled)) {
          capBySeat.set(capSeat, {
            threshold: entry.alert.threshold,
            alertId: entry.alert.id,
            enabled,
          });
        }
        continue;
      }
      const warningSeat = warningKeyToSeat.get(key);
      if (warningSeat) {
        warningIdBySeat.set(warningSeat, entry.alert.id);
      }
    }
  } catch (err) {
    throw normalizeError(err);
  }

  const caps = {} as Record<NormalizedPoolLimitSeatType, MetronomeCapAlertInfo>;
  for (const [seatType, cap] of capBySeat) {
    caps[seatType] = {
      threshold: cap.threshold,
      alertId: cap.alertId,
      warningAlertId: warningIdBySeat.get(seatType) ?? null,
    };
  }
  return caps;
}

export const getCachedDefaultCapThresholdsBySeatType = cacheWithRedis(
  fetchDefaultCapThresholdsBySeatType,
  spendLimitCacheResolver,
  { ttlMs: SPEND_LIMIT_CACHE_TTL_MS }
);

const invalidateCachedDefaultCapThresholdsBySeatType =
  bestEffortInvalidateCacheWithRedis(
    fetchDefaultCapThresholdsBySeatType,
    spendLimitCacheResolver,
    "members-usage default spend caps by seat type"
  );

// ============================================================================
// 80% warning alerts — same shape as cap alerts, but at USER_AWU_WARNING_PERCENTAGE
// of the cap. They fire before the hard block to give users advance notice.
// ============================================================================

/**
 * Idempotently ensure a per-seat-type default per-user 80% warning alert
 * exists. The threshold is floor(capAwuCredits * 0.8). Skipped if the
 * result would be zero.
 */
export async function upsertMetronomeDefaultUserWarningAlertForSeatType({
  metronomeCustomerId,
  workspaceId,
  seatType,
  capAwuCredits,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  seatType: NormalizedPoolLimitSeatType;
  capAwuCredits: number;
}): Promise<Result<{ alertId: string } | null, Error>> {
  const threshold = warningAwuCredits(capAwuCredits);
  if (threshold <= 0) {
    return new Ok(null);
  }
  const upsertResult = await upsertMetronomeAlert({
    alert_type: "spend_threshold_reached",
    name: `Default per-user warning ${seatType} ${workspaceId} (${threshold} AWU / ${Math.round(USER_AWU_WARNING_PERCENTAGE * 100)}% of ${capAwuCredits})`,
    threshold,
    credit_type_id: getCreditTypeAwuId(),
    customer_id: metronomeCustomerId,
    group_values: [{ key: USER_ID_GROUP_KEY }],
    uniqueness_key: defaultUserWarningAlertUniquenessKeyForSeatType(
      seatType,
      workspaceId
    ),
  });
  if (upsertResult.isErr()) {
    return new Err(upsertResult.error);
  }
  logger.info(
    {
      workspaceId,
      seatType,
      metronomeCustomerId,
      alertId: upsertResult.value.alertId,
      threshold,
      capAwuCredits,
    },
    "[Metronome DefaultUserWarning] Synced per-seat-type default per-user warning alert"
  );
  return new Ok({ alertId: upsertResult.value.alertId });
}
