import { currencyToAwuCredits } from "@app/lib/metronome/amounts";
import { getMetronomeClient } from "@app/lib/metronome/client";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

function paygAlertUniquenessKey(workspaceSId: string): string {
  return `payg-cap-${workspaceSId}`;
}

async function findExistingPaygAlert({
  metronomeCustomerId,
  workspaceSId,
}: {
  metronomeCustomerId: string;
  workspaceSId: string;
}): Promise<Result<{ id: string; threshold: number } | null, Error>> {
  const target = paygAlertUniquenessKey(workspaceSId);
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
 * Idempotently ensure a Metronome `spend_threshold_reached` alert exists on
 * the customer matching the workspace's PAYG cap. If an alert with a
 * different threshold already exists, it's archived (with key release) and
 * recreated.
 */
export async function syncMetronomePaygCapAlert({
  metronomeCustomerId,
  paygCapDollars,
  workspaceSId,
}: {
  metronomeCustomerId: string;
  paygCapDollars: number;
  workspaceSId: string;
}): Promise<Result<{ alertId: string }, Error>> {
  const paygCapAwu = Math.round(currencyToAwuCredits(paygCapDollars, "usd"));

  const findResult = await findExistingPaygAlert({
    metronomeCustomerId,
    workspaceSId,
  });
  if (findResult.isErr()) {
    return new Err(findResult.error);
  }
  const existing = findResult.value;

  if (existing && existing.threshold === paygCapAwu) {
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
      name: `PAYG cap`,
      threshold: paygCapAwu,
      credit_type_id: getCreditTypeAwuId(),
      customer_id: metronomeCustomerId,
      uniqueness_key: paygAlertUniquenessKey(workspaceSId),
    });
    logger.info(
      {
        workspaceId: workspaceSId,
        metronomeCustomerId,
        alertId: created.data.id,
        paygCapDollars,
        paygCapAwu,
      },
      "[Metronome PAYG] Synced PAYG cap alert"
    );
    return new Ok({ alertId: created.data.id });
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/**
 * Archive the workspace's PAYG cap alert, if any. Idempotent — no-op when
 * no matching alert exists.
 */
export async function clearMetronomePaygCapAlert({
  metronomeCustomerId,
  workspaceSId,
}: {
  metronomeCustomerId: string;
  workspaceSId: string;
}): Promise<Result<void, Error>> {
  const findResult = await findExistingPaygAlert({
    metronomeCustomerId,
    workspaceSId,
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
        metronomeCustomerId,
        alertId: existing.id,
      },
      "[Metronome PAYG] Cleared PAYG cap alert"
    );
    return new Ok(undefined);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}
