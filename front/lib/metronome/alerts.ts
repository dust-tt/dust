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

export async function findMetronomeAlert({
  metronomeCustomerId,
  uniquenessKey,
}: {
  metronomeCustomerId: string;
  uniquenessKey: string;
}): Promise<Result<CustomerAlert | null, Error>> {
  try {
    for await (const entry of listMetronomeAlerts({
      customer_id: metronomeCustomerId,
      alert_statuses: ["ENABLED", "DISABLED"],
    })) {
      if (entry.alert.uniqueness_key === uniquenessKey) {
        return new Ok(entry);
      }
    }
    return new Ok(null);
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

  try {
    if (existing) {
      await archiveMetronomeAlert({ id: existing.alert.id });
    }
    const created = await createMetronomeAlert(params);
    logger.info(
      {
        customerId: params.customer_id,
        uniquenessKey: params.uniqueness_key,
        alertId: created.data.id,
        threshold: params.threshold,
      },
      "[Metronome Alert] upsert: created alert"
    );
    return new Ok({ alertId: created.data.id });
  } catch (err) {
    // A uniqueness-key 409 means another alert still holds this key — typically
    // one archived previously without releasing the key, which
    // `findMetronomeAlert` (ENABLED/DISABLED only) doesn't surface. Archive the
    // conflicting alert (releasing the key) and retry the create once.
    const conflictingId = conflictingAlertIdFromError(err);
    if (conflictingId) {
      logger.warn(
        {
          customerId: params.customer_id,
          uniquenessKey: params.uniqueness_key,
          conflictingAlertId: conflictingId,
          threshold: params.threshold,
        },
        "[Metronome Alert] upsert: uniqueness_key conflict (409); archiving conflicting alert and retrying create"
      );
      try {
        await archiveMetronomeAlert({ id: conflictingId });
        const created = await createMetronomeAlert(params);
        logger.info(
          {
            customerId: params.customer_id,
            uniquenessKey: params.uniqueness_key,
            alertId: created.data.id,
            conflictingAlertId: conflictingId,
            threshold: params.threshold,
          },
          "[Metronome Alert] upsert: recreated alert after releasing conflicting uniqueness_key"
        );
        return new Ok({ alertId: created.data.id });
      } catch (retryErr) {
        logger.error(
          {
            customerId: params.customer_id,
            uniquenessKey: params.uniqueness_key,
            conflictingAlertId: conflictingId,
            threshold: params.threshold,
            err: normalizeError(retryErr),
          },
          "[Metronome Alert] upsert: retry after archiving conflicting alert failed"
        );
        return new Err(normalizeError(retryErr));
      }
    }
    // No conflicting_id on the error: log the raw error so a uniqueness-key
    // conflict whose shape we don't yet recognize is still visible in the logs
    // (instead of being swallowed into a generic "metronome_error").
    logger.error(
      {
        customerId: params.customer_id,
        uniquenessKey: params.uniqueness_key,
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
    return new Err(normalizeError(err));
  }
}
