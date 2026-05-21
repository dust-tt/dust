import { getMetronomeClient } from "@app/lib/metronome/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { V1 } from "@metronome/sdk/resources";

export type MetronomeAlert = {
  id: string;
  threshold: number;
};

type UpsertMetronomeAlertParams = V1.AlertCreateParams & {
  customer_id: string;
  uniqueness_key: string;
};

async function createMetronomeAlert(
  params: V1.AlertCreateParams
): Promise<V1.AlertCreateResponse> {
  const client = getMetronomeClient();
  return client.v1.alerts.create(params);
}

async function archiveMetronomeAlert(
  params: V1.AlertArchiveParams
): Promise<V1.AlertArchiveResponse> {
  const client = getMetronomeClient();
  return client.v1.alerts.archive({
    ...params,
    release_uniqueness_key: true,
  });
}

export async function findMetronomeAlert({
  metronomeCustomerId,
  uniquenessKey,
}: {
  metronomeCustomerId: string;
  uniquenessKey: string;
}): Promise<Result<MetronomeAlert | null, Error>> {
  try {
    const client = getMetronomeClient();
    for await (const entry of client.v1.customers.alerts.list({
      customer_id: metronomeCustomerId,
      alert_statuses: ["ENABLED", "DISABLED"],
    })) {
      if (entry.alert.uniqueness_key === uniquenessKey) {
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
    return new Err(findResult.error);
  }
  const existing = findResult.value;

  if (existing && existing.threshold === params.threshold) {
    return new Ok({ alertId: existing.id });
  }

  try {
    if (existing) {
      await archiveMetronomeAlert({ id: existing.id });
    }
    const created = await createMetronomeAlert(params);
    return new Ok({ alertId: created.data.id });
  } catch (err) {
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
    await archiveMetronomeAlert({ id: existing.id });
    return new Ok({ alertId: existing.id });
  } catch (err) {
    return new Err(normalizeError(err));
  }
}
