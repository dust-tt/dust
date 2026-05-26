import {
  clearMetronomeAlert,
  upsertMetronomeAlert,
} from "@app/lib/metronome/alerts";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

function paygAlertUniquenessKey(workspaceId: string): string {
  return `payg-cap-${workspaceId}`;
}

/**
 * Idempotently ensure a Metronome `spend_threshold_reached` alert exists on
 * the customer matching the workspace's AWU PAYG cap. If an alert with a
 * different threshold already exists, it's archived (with key release) and
 * recreated. The cap is expressed in AWU credits (the same unit Metronome
 * tracks AWU consumption in).
 */
export async function upsertMetronomePaygCapAlert({
  metronomeCustomerId,
  paygCapCredits,
  workspaceId,
}: {
  metronomeCustomerId: string;
  paygCapCredits: number;
  workspaceId: string;
}): Promise<Result<{ alertId: string }, Error>> {
  const upsertResult = await upsertMetronomeAlert({
    alert_type: "spend_threshold_reached",
    name: `PAYG cap workspace ${workspaceId} (${paygCapCredits} AWU)`,
    threshold: paygCapCredits,
    credit_type_id: getCreditTypeAwuId(),
    customer_id: metronomeCustomerId,
    uniqueness_key: paygAlertUniquenessKey(workspaceId),
  });
  if (upsertResult.isErr()) {
    return new Err(upsertResult.error);
  }

  logger.info(
    {
      workspaceId,
      metronomeCustomerId,
      alertId: upsertResult.value.alertId,
      paygCapCredits,
    },
    "[Metronome PAYG] Synced PAYG cap alert"
  );
  return new Ok({ alertId: upsertResult.value.alertId });
}

/**
 * Archive the workspace's PAYG cap alert, if any. Idempotent — no-op when
 * no matching alert exists.
 */
export async function clearMetronomePaygCapAlert({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Result<void, Error>> {
  const result = await clearMetronomeAlert({
    metronomeCustomerId,
    uniquenessKey: paygAlertUniquenessKey(workspaceId),
  });
  if (result.isErr()) {
    return new Err(result.error);
  }

  if (result.value) {
    logger.info(
      {
        workspaceId,
        metronomeCustomerId,
        alertId: result.value.alertId,
      },
      "[Metronome PAYG] Cleared PAYG cap alert"
    );
  }
  return new Ok(undefined);
}
