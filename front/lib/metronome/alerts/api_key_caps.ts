import {
  clearMetronomeAlert,
  upsertMetronomeAlert,
} from "@app/lib/metronome/alerts";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import { API_KEY_NAME_GROUP_KEY } from "@app/lib/metronome/per_api_key_usage";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

// The key name is the stable, workspace-unique join key between a key, this
// alert, and the webhook that transitions `keys.creditState` (the name is
// immutable and unique among active keys — see the keys schema migration).
function perApiKeyCapAlertUniquenessKey(
  workspaceId: string,
  keyName: string
): string {
  return `per-api-key-cap-${workspaceId}-${keyName}`;
}

/**
 * Idempotently ensure a Metronome `spend_threshold_reached` alert exists for
 * this API key, with the given AWU threshold. If an alert with a different
 * threshold already exists, it is archived (key released) and recreated.
 *
 * The alert is scoped to the key via `group_values` on `api_key_name`, so
 * Metronome evaluates spend for just this key and fires `reached` / `resolved`
 * webhooks that drive `keys.creditState`. Spend is anchored to the billing
 * period, so `resolved` fires at monthly renewal — matching the legacy
 * per-key monthly cap.
 */
export async function upsertMetronomeApiKeyCapAlert({
  metronomeCustomerId,
  workspaceId,
  keyName,
  awuCredits,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  keyName: string;
  awuCredits: number;
}): Promise<Result<{ alertId: string }, Error>> {
  const upsertResult = await upsertMetronomeAlert({
    alert_type: "spend_threshold_reached",
    name: `Per-API-key cap ${workspaceId}-${keyName} (${awuCredits} AWU)`,
    threshold: awuCredits,
    credit_type_id: getCreditTypeAwuId(),
    customer_id: metronomeCustomerId,
    group_values: [{ key: API_KEY_NAME_GROUP_KEY, value: keyName }],
    uniqueness_key: perApiKeyCapAlertUniquenessKey(workspaceId, keyName),
  });
  if (upsertResult.isErr()) {
    return new Err(upsertResult.error);
  }

  logger.info(
    {
      workspaceId,
      keyName,
      metronomeCustomerId,
      alertId: upsertResult.value.alertId,
      awuCredits,
    },
    "[Metronome ApiKeyCap] Synced per-API-key cap alert"
  );
  return new Ok({ alertId: upsertResult.value.alertId });
}

/**
 * Archive the per-API-key cap alert for this workspace/key-name pair, if any.
 * Idempotent — no-op when no matching alert exists.
 */
export async function clearMetronomeApiKeyCapAlert({
  metronomeCustomerId,
  workspaceId,
  keyName,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  keyName: string;
}): Promise<Result<void, Error>> {
  const result = await clearMetronomeAlert({
    metronomeCustomerId,
    uniquenessKey: perApiKeyCapAlertUniquenessKey(workspaceId, keyName),
  });
  if (result.isErr()) {
    return new Err(result.error);
  }

  if (result.value) {
    logger.info(
      {
        workspaceId,
        keyName,
        metronomeCustomerId,
        alertId: result.value.alertId,
      },
      "[Metronome ApiKeyCap] Cleared per-API-key cap alert"
    );
  }
  return new Ok(undefined);
}
