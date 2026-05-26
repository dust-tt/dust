import {
  archiveMetronomeAlert,
  createMetronomeAlert,
  listMetronomeAlerts,
} from "@app/lib/metronome/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { V1 } from "@metronome/sdk/resources";
import type { CustomerAlert } from "@metronome/sdk/resources/v1/customers";

type UpsertMetronomeAlertParams = V1.AlertCreateParams & {
  customer_id: string;
  uniqueness_key: string;
};

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
    return new Err(findResult.error);
  }
  const existing = findResult.value;

  if (existing && existing.alert.threshold === params.threshold) {
    return new Ok({ alertId: existing.alert.id });
  }

  try {
    if (existing) {
      await archiveMetronomeAlert({ id: existing.alert.id });
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
    await archiveMetronomeAlert({ id: existing.alert.id });
    return new Ok({ alertId: existing.alert.id });
  } catch (err) {
    return new Err(normalizeError(err));
  }
}
