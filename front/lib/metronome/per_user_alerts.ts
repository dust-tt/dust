import { getMetronomeClient } from "@app/lib/metronome/client";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const USER_ID_GROUP_KEY = "user_id";

function perUserAlertUniquenessKeyPrefix(workspaceSId: string): string {
  return `per-user-cap-${workspaceSId}-`;
}

function perUserAlertUniquenessKey(
  workspaceSId: string,
  userSId: string
): string {
  return `${perUserAlertUniquenessKeyPrefix(workspaceSId)}${userSId}`;
}

async function findExistingPerUserAlert({
  metronomeCustomerId,
  workspaceSId,
  userSId,
}: {
  metronomeCustomerId: string;
  workspaceSId: string;
  userSId: string;
}): Promise<Result<{ id: string; threshold: number } | null, Error>> {
  const target = perUserAlertUniquenessKey(workspaceSId, userSId);
  try {
    const client = getMetronomeClient();
    for await (const entry of client.v1.customers.alerts.list({
      customer_id: metronomeCustomerId,
      alert_statuses: ["ENABLED", "DISABLED"],
    })) {
      if (entry.alert.uniqueness_key === target) {
        return new Ok({
          id: entry.alert.id,
          threshold: entry.alert.threshold,
        });
      }
    }
    return new Ok(null);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/**
 * Look up the current per-user cap (if any) for a workspace/user pair by
 * matching `uniqueness_key`. Returns the alert id and threshold, or
 * `null` if no cap is configured.
 */
export async function getMetronomePerUserCap({
  metronomeCustomerId,
  workspaceSId,
  userSId,
}: {
  metronomeCustomerId: string;
  workspaceSId: string;
  userSId: string;
}): Promise<Result<{ alertId: string; threshold: number } | null, Error>> {
  const findResult = await findExistingPerUserAlert({
    metronomeCustomerId,
    workspaceSId,
    userSId,
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
 * List per-user cap thresholds for a workspace. Returns a `Map<userSId,
 * threshold>` built from all enabled/disabled alerts whose
 * `uniqueness_key` matches the per-user cap pattern for this workspace.
 */
export async function listMetronomePerUserCapsForWorkspace({
  metronomeCustomerId,
  workspaceSId,
}: {
  metronomeCustomerId: string;
  workspaceSId: string;
}): Promise<Result<Map<string, number>, Error>> {
  const prefix = perUserAlertUniquenessKeyPrefix(workspaceSId);
  const caps = new Map<string, number>();
  try {
    const client = getMetronomeClient();
    for await (const entry of client.v1.customers.alerts.list({
      customer_id: metronomeCustomerId,
      alert_statuses: ["ENABLED", "DISABLED"],
    })) {
      const key = entry.alert.uniqueness_key;
      if (!key || !key.startsWith(prefix)) {
        continue;
      }
      const userSId = key.slice(prefix.length);
      if (!userSId) {
        continue;
      }
      caps.set(userSId, entry.alert.threshold);
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
export async function syncMetronomePerUserCapAlert({
  metronomeCustomerId,
  workspaceSId,
  userSId,
  awuCredits,
}: {
  metronomeCustomerId: string;
  workspaceSId: string;
  userSId: string;
  awuCredits: number;
}): Promise<Result<{ alertId: string }, Error>> {
  const findResult = await findExistingPerUserAlert({
    metronomeCustomerId,
    workspaceSId,
    userSId,
  });
  if (findResult.isErr()) {
    return new Err(findResult.error);
  }
  const existing = findResult.value;

  if (existing && existing.threshold === awuCredits) {
    return new Ok({ alertId: existing.id });
  }

  const client = getMetronomeClient();
  if (existing) {
    try {
      await client.v1.alerts.archive({
        id: existing.id,
        release_uniqueness_key: true,
      });
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  try {
    const created = await client.v1.alerts.create({
      alert_type: "spend_threshold_reached",
      name: `Per-user cap (${userSId})`,
      threshold: awuCredits,
      credit_type_id: getCreditTypeAwuId(),
      customer_id: metronomeCustomerId,
      group_values: [{ key: USER_ID_GROUP_KEY, value: userSId }],
      uniqueness_key: perUserAlertUniquenessKey(workspaceSId, userSId),
    });
    logger.info(
      {
        workspaceId: workspaceSId,
        userId: userSId,
        metronomeCustomerId,
        alertId: created.data.id,
        awuCredits,
      },
      "[Metronome PerUserCap] Synced per-user cap alert"
    );
    return new Ok({ alertId: created.data.id });
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/**
 * Archive the per-user cap alert for this workspace/user pair, if any.
 * Idempotent — no-op when no matching alert exists.
 */
export async function clearMetronomePerUserCapAlert({
  metronomeCustomerId,
  workspaceSId,
  userSId,
}: {
  metronomeCustomerId: string;
  workspaceSId: string;
  userSId: string;
}): Promise<Result<void, Error>> {
  const findResult = await findExistingPerUserAlert({
    metronomeCustomerId,
    workspaceSId,
    userSId,
  });
  if (findResult.isErr()) {
    return new Err(findResult.error);
  }
  const existing = findResult.value;
  if (!existing) {
    return new Ok(undefined);
  }

  try {
    const client = getMetronomeClient();
    await client.v1.alerts.archive({
      id: existing.id,
      release_uniqueness_key: true,
    });
    logger.info(
      {
        workspaceId: workspaceSId,
        userId: userSId,
        metronomeCustomerId,
        alertId: existing.id,
      },
      "[Metronome PerUserCap] Cleared per-user cap alert"
    );
    return new Ok(undefined);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}
