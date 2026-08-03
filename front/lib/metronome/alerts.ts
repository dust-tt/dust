import {
  archiveMetronomeAlert,
  createMetronomeAlert,
  listMetronomeAlerts,
} from "@app/lib/metronome/client";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { V1 } from "@metronome/sdk/resources";
import type { CustomerAlert } from "@metronome/sdk/resources/v1/customers";

type UpsertMetronomeAlertParams = V1.AlertCreateParams & {
  customer_id: string;
  uniqueness_key: string;
};

// A Metronome uniqueness key can only be released by archiving its alert with
// `release_uniqueness_key: true`. An alert archived WITHOUT releasing its key
// (e.g. manually in the console) orphans that key: re-archiving it returns
// `400 Alert already archived` and there is no API to release the key
// afterwards. To stay recoverable, an alert's effective key may carry a
// generation suffix (`<baseKey>::g<N>`). The base key is used normally; only
// when a lower generation is orphaned do we advance to the next. All lookups
// match on the base key and ignore the suffix.
const UNIQUENESS_KEY_GENERATION_SEPARATOR = "::g";

// Backstop so a pathological customer (many orphaned generations) fails loudly
// instead of looping forever.
const MAX_UNIQUENESS_KEY_GENERATIONS = 20;

function generationKey(baseKey: string, generation: number): string {
  return generation === 0
    ? baseKey
    : `${baseKey}${UNIQUENESS_KEY_GENERATION_SEPARATOR}${generation}`;
}

// Strip the `::g<N>` generation suffix to recover the logical base key. Keys
// without a numeric suffix are returned unchanged.
export function baseUniquenessKey(key: string): string {
  const idx = key.lastIndexOf(UNIQUENESS_KEY_GENERATION_SEPARATOR);
  if (idx === -1) {
    return key;
  }
  const suffix = key.slice(idx + UNIQUENESS_KEY_GENERATION_SEPARATOR.length);
  return /^\d+$/.test(suffix) ? key.slice(0, idx) : key;
}

function uniquenessKeyGeneration(key: string): number {
  const idx = key.lastIndexOf(UNIQUENESS_KEY_GENERATION_SEPARATOR);
  if (idx === -1) {
    return 0;
  }
  const suffix = key.slice(idx + UNIQUENESS_KEY_GENERATION_SEPARATOR.length);
  return /^\d+$/.test(suffix) ? Number(suffix) : 0;
}

// Detect Metronome's `400 Alert already archived` response, returned when we
// try to archive an alert that is already archived — meaning its uniqueness key
// is orphaned and cannot be released via the API.
function isAlertAlreadyArchivedError(err: unknown): boolean {
  const messages: string[] = [];
  if (typeof err === "object" && err !== null) {
    if ("message" in err && typeof err.message === "string") {
      messages.push(err.message);
    }
    if (
      "error" in err &&
      typeof err.error === "object" &&
      err.error !== null &&
      "message" in err.error &&
      typeof err.error.message === "string"
    ) {
      messages.push(err.error.message);
    }
  }
  return messages.some((m) => /already archived/i.test(m));
}

// Extract the id of the alert that already holds a uniqueness key from a
// Metronome 409 conflict error. The SDK surfaces the response body on `.error`,
// which carries `conflicting_id` for uniqueness-key conflicts. Narrowed with
// `in`/`typeof` guards so we never cast.
function conflictingAlertIdFromError(err: unknown): string | null {
  if (
    typeof err === "object" &&
    err !== null &&
    "error" in err &&
    typeof err.error === "object" &&
    err.error !== null &&
    "conflicting_id" in err.error &&
    typeof err.error.conflicting_id === "string"
  ) {
    return err.error.conflicting_id;
  }
  return null;
}

// Find the live alert for a logical (base) uniqueness key. Matches on the base
// key, ignoring any `::g<N>` generation suffix, and prefers an enabled alert
// over a disabled one, then the highest generation. Returns null when no
// enabled/disabled alert carries the key (archived alerts are excluded).
export async function findMetronomeAlert({
  metronomeCustomerId,
  uniquenessKey,
}: {
  metronomeCustomerId: string;
  uniquenessKey: string;
}): Promise<Result<CustomerAlert | null, Error>> {
  try {
    let best: CustomerAlert | null = null;
    let bestGeneration = -1;
    let bestEnabled = false;
    for await (const entry of listMetronomeAlerts({
      customer_id: metronomeCustomerId,
      alert_statuses: ["ENABLED", "DISABLED"],
    })) {
      const key = entry.alert.uniqueness_key;
      if (!key || baseUniquenessKey(key) !== uniquenessKey) {
        continue;
      }
      const enabled = entry.alert.status === "enabled";
      const generation = uniquenessKeyGeneration(key);
      if (
        best === null ||
        (enabled && !bestEnabled) ||
        (enabled === bestEnabled && generation > bestGeneration)
      ) {
        best = entry;
        bestEnabled = enabled;
        bestGeneration = generation;
      }
    }
    return new Ok(best);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/**
 * Idempotently ensure an alert exists on `customer_id` with the given
 * `uniqueness_key` and `threshold`. If an alert with the same key already
 * exists at the requested threshold, it's reused. Otherwise the previous
 * one is archived (key released) and a new one is created.
 */
export async function upsertMetronomeAlert(
  params: UpsertMetronomeAlertParams
): Promise<Result<{ alertId: string }, Error>> {
  const findResult = await findMetronomeAlert({
    metronomeCustomerId: params.customer_id,
    uniquenessKey: params.uniqueness_key,
  });
  if (findResult.isErr()) {
    logger.error(
      {
        customerId: params.customer_id,
        uniquenessKey: params.uniqueness_key,
        err: findResult.error,
      },
      "[Metronome Alert] upsert: failed to list/find existing alert"
    );
    return new Err(findResult.error);
  }
  const existing = findResult.value;

  if (existing && existing.alert.threshold === params.threshold) {
    logger.info(
      {
        customerId: params.customer_id,
        uniquenessKey: params.uniqueness_key,
        alertId: existing.alert.id,
        threshold: params.threshold,
      },
      "[Metronome Alert] upsert: reusing existing alert at requested threshold"
    );
    return new Ok({ alertId: existing.alert.id });
  }

  logger.info(
    {
      customerId: params.customer_id,
      uniquenessKey: params.uniqueness_key,
      existingAlertId: existing?.alert.id ?? null,
      existingThreshold: existing?.alert.threshold ?? null,
      newThreshold: params.threshold,
    },
    existing
      ? "[Metronome Alert] upsert: archiving existing alert (threshold changed) and recreating"
      : "[Metronome Alert] upsert: creating new alert"
  );

  if (existing) {
    // Archive the stale alert to release its key before recreating. Tolerate a
    // racing archive (another request beat us to it): the old alert is already
    // inactive, which is the post-condition we want.
    try {
      await archiveMetronomeAlert({ id: existing.alert.id });
    } catch (archiveErr) {
      if (!isAlertAlreadyArchivedError(archiveErr)) {
        logger.error(
          {
            customerId: params.customer_id,
            uniquenessKey: params.uniqueness_key,
            alertId: existing.alert.id,
            err: normalizeError(archiveErr),
          },
          "[Metronome Alert] upsert: failed to archive stale alert before recreate"
        );
        return new Err(normalizeError(archiveErr));
      }
    }
  }

  return createAlertReleasingOrphanedKeys(params);
}

// Create the alert, recovering from uniqueness-key conflicts. On a 409 the key
// is held by another alert: if it can be archived (releasing the key) we retry
// the same key; if it is already archived — an orphaned key with no API path to
// release it — we advance to the next generation key. Lookups match on the base
// key, so the live alert stays discoverable at whatever generation wins.
async function createAlertReleasingOrphanedKeys(
  params: UpsertMetronomeAlertParams
): Promise<Result<{ alertId: string }, Error>> {
  const baseKey = params.uniqueness_key;

  for (
    let generation = 0;
    generation <= MAX_UNIQUENESS_KEY_GENERATIONS;
    generation++
  ) {
    const uniquenessKey = generationKey(baseKey, generation);
    const createParams = { ...params, uniqueness_key: uniquenessKey };

    try {
      const created = await createMetronomeAlert(createParams);
      logger.info(
        {
          customerId: params.customer_id,
          baseUniquenessKey: baseKey,
          uniquenessKey,
          generation,
          alertId: created.data.id,
          threshold: params.threshold,
        },
        "[Metronome Alert] upsert: created alert"
      );
      return new Ok({ alertId: created.data.id });
    } catch (err) {
      const conflictingId = conflictingAlertIdFromError(err);
      if (!conflictingId) {
        logger.error(
          {
            customerId: params.customer_id,
            baseUniquenessKey: baseKey,
            uniquenessKey,
            generation,
            threshold: params.threshold,
            err: normalizeError(err),
            rawError:
              typeof err === "object" && err !== null && "error" in err
                ? err.error
                : undefined,
          },
          "[Metronome Alert] upsert: create failed (no conflicting_id surfaced)"
        );
        return new Err(normalizeError(err));
      }

      try {
        await archiveMetronomeAlert({ id: conflictingId });
      } catch (archiveErr) {
        if (isAlertAlreadyArchivedError(archiveErr)) {
          logger.warn(
            {
              customerId: params.customer_id,
              baseUniquenessKey: baseKey,
              uniquenessKey,
              conflictingAlertId: conflictingId,
              generation,
            },
            "[Metronome Alert] upsert: uniqueness_key orphaned by an already-archived alert; advancing to next generation"
          );
          continue;
        }
        logger.error(
          {
            customerId: params.customer_id,
            baseUniquenessKey: baseKey,
            uniquenessKey,
            conflictingAlertId: conflictingId,
            err: normalizeError(archiveErr),
          },
          "[Metronome Alert] upsert: failed to archive conflicting alert"
        );
        return new Err(normalizeError(archiveErr));
      }

      try {
        const created = await createMetronomeAlert(createParams);
        logger.info(
          {
            customerId: params.customer_id,
            baseUniquenessKey: baseKey,
            uniquenessKey,
            generation,
            conflictingAlertId: conflictingId,
            alertId: created.data.id,
            threshold: params.threshold,
          },
          "[Metronome Alert] upsert: recreated alert after releasing conflicting uniqueness_key"
        );
        return new Ok({ alertId: created.data.id });
      } catch (retryErr) {
        logger.error(
          {
            customerId: params.customer_id,
            baseUniquenessKey: baseKey,
            uniquenessKey,
            generation,
            conflictingAlertId: conflictingId,
            threshold: params.threshold,
            err: normalizeError(retryErr),
          },
          "[Metronome Alert] upsert: retry after releasing conflicting key failed"
        );
        return new Err(normalizeError(retryErr));
      }
    }
  }

  logger.error(
    {
      customerId: params.customer_id,
      baseUniquenessKey: baseKey,
      maxGenerations: MAX_UNIQUENESS_KEY_GENERATIONS,
    },
    "[Metronome Alert] upsert: exhausted uniqueness-key generations; all orphaned by archived alerts"
  );
  return new Err(
    new Error(
      `Exhausted ${MAX_UNIQUENESS_KEY_GENERATIONS} uniqueness-key generations for "${baseKey}"; all held by already-archived alerts.`
    )
  );
}

/**
 * Archive the alert matching `uniqueness_key`, if any. Idempotent — returns
 * `null` when no matching alert exists, or `{ alertId }` for the archived
 * alert.
 */
export async function clearMetronomeAlert({
  metronomeCustomerId,
  uniquenessKey,
}: {
  metronomeCustomerId: string;
  uniquenessKey: string;
}): Promise<Result<{ alertId: string } | null, Error>> {
  const findResult = await findMetronomeAlert({
    metronomeCustomerId,
    uniquenessKey,
  });
  if (findResult.isErr()) {
    return new Err(findResult.error);
  }
  const existing = findResult.value;
  if (!existing) {
    return new Ok(null);
  }

  try {
    await archiveMetronomeAlert({ id: existing.alert.id });
    return new Ok({ alertId: existing.alert.id });
  } catch (err) {
    // Already archived is the post-condition clear guarantees: treat as success.
    if (isAlertAlreadyArchivedError(err)) {
      return new Ok({ alertId: existing.alert.id });
    }
    return new Err(normalizeError(err));
  }
}
