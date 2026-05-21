import {
  clearMetronomeAlert,
  findMetronomeAlert,
  upsertMetronomeAlert,
} from "@app/lib/metronome/alerts";
import { getMetronomeClient } from "@app/lib/metronome/client";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const USER_ID_GROUP_KEY = "user_id";

function perUserAlertUniquenessKeyPrefix(workspaceId: string): string {
  return `per-user-cap-${workspaceId}-`;
}

function perUserAlertUniquenessKey(
  workspaceId: string,
  userId: string
): string {
  return `${perUserAlertUniquenessKeyPrefix(workspaceId)}${userId}`;
}

/**
 * Look up the current per-user cap (if any) for a workspace/user pair by
 * matching `uniqueness_key`. Returns the alert id and threshold, or
 * `null` if no cap is configured.
 */
export async function getMetronomePerUserCap({
  metronomeCustomerId,
  workspaceId,
  userId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  userId: string;
}): Promise<Result<{ alertId: string; threshold: number } | null, Error>> {
  const findResult = await findMetronomeAlert({
    metronomeCustomerId,
    uniquenessKey: perUserAlertUniquenessKey(workspaceId, userId),
  });
  if (findResult.isErr()) {
    return new Err(findResult.error);
  }
  const existing = findResult.value;
  if (!existing) {
    return new Ok(null);
  }
  return new Ok({ alertId: existing.id, threshold: existing.threshold });
}

/**
 * List per-user cap thresholds for a workspace. Returns a `Map<userId,
 * threshold>` built from all enabled/disabled alerts whose
 * `uniqueness_key` matches the per-user cap pattern for this workspace.
 */
export async function listMetronomePerUserCapsForWorkspace({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Result<Map<string, number>, Error>> {
  const prefix = perUserAlertUniquenessKeyPrefix(workspaceId);
  const caps = new Map<string, number>();
  try {
    const client = getMetronomeClient();
    for await (const entry of client.v1.customers.alerts.list({
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
      caps.set(userId, entry.alert.threshold);
    }
    return new Ok(caps);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

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
  return new Ok(undefined);
}
