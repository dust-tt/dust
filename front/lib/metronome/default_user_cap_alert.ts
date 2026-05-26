import {
  findMetronomeAlert,
  upsertMetronomeAlert,
} from "@app/lib/metronome/alerts";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { CustomerAlert } from "@metronome/sdk/resources/v1/customers";

const USER_ID_GROUP_KEY = "user_id";

function defaultUserCapAlertUniquenessKey(workspaceId: string): string {
  return `default-user-cap-${workspaceId}`;
}

/**
 * Look up the workspace-wide default per-user cap alert. Returns the alert
 * id, threshold and current Metronome evaluation state, or `null` if no
 * default cap has been configured yet.
 *
 * The default alert is fanned out per `user_id` by Metronome: it uses
 * `group_values: [{ key: "user_id" }]` with no value, so a single alert
 * configuration produces per-user `reached` / `resolved` events.
 */
export async function getMetronomeDefaultUserCapAlert({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Result<CustomerAlert | null, Error>> {
  return findMetronomeAlert({
    metronomeCustomerId,
    uniquenessKey: defaultUserCapAlertUniquenessKey(workspaceId),
  });
}

/**
 * Idempotently ensure a workspace-wide default per-user cap alert exists on
 * the customer, with the given AWU threshold. If an alert with a different
 * threshold already exists, it's archived (with key release) and recreated.
 *
 * Fan-out: `group_values: [{ key: "user_id" }]` with no value — Metronome
 * fires one `reached` / `resolved` event per user that crosses the threshold,
 * with that user's id populated in `group_values[].value`.
 */
export async function upsertMetronomeDefaultUserCapAlert({
  metronomeCustomerId,
  workspaceId,
  awuCredits,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  awuCredits: number;
}): Promise<Result<{ alertId: string }, Error>> {
  const upsertResult = await upsertMetronomeAlert({
    alert_type: "spend_threshold_reached",
    name: `Default per-user cap ${workspaceId} (${awuCredits} AWU)`,
    threshold: awuCredits,
    credit_type_id: getCreditTypeAwuId(),
    customer_id: metronomeCustomerId,
    group_values: [{ key: USER_ID_GROUP_KEY }],
    uniqueness_key: defaultUserCapAlertUniquenessKey(workspaceId),
  });
  if (upsertResult.isErr()) {
    return new Err(upsertResult.error);
  }

  logger.info(
    {
      workspaceId,
      metronomeCustomerId,
      alertId: upsertResult.value.alertId,
      awuCredits,
    },
    "[Metronome DefaultUserCap] Synced default per-user cap alert"
  );
  return new Ok({ alertId: upsertResult.value.alertId });
}
