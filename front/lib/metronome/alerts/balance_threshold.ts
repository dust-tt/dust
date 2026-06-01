import {
  clearMetronomeAlert,
  upsertMetronomeAlert,
} from "@app/lib/metronome/alerts";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

// Persisted as the alert uniqueness key on Metronome's side. Changing it would
// orphan any existing alert (the new key wouldn't match, so
// `clearMetronomeBalanceThresholdAlert` would silently no-op for workspaces
// that have a pre-rename alert).
function balanceThresholdAlertUniquenessKey(workspaceId: string): string {
  return `workspace-balance-threshold-${workspaceId}`;
}

/**
 * Idempotently ensure a Metronome
 * `low_remaining_contract_credit_and_commit_balance_reached` alert exists on the
 * customer matching the workspace's configured credit-balance threshold.
 * Metronome fires the alert when the combined remaining contract-credit and
 * commit balance drops below `balanceThresholdCredits`. If an alert with a
 * different threshold already exists, it's archived (with key release) and
 * recreated. The threshold is expressed in AWU credits (the same unit Metronome
 * tracks AWU balances in).
 */
export async function upsertMetronomeBalanceThresholdAlert({
  metronomeCustomerId,
  balanceThresholdCredits,
  workspaceId,
}: {
  metronomeCustomerId: string;
  balanceThresholdCredits: number;
  workspaceId: string;
}): Promise<Result<{ alertId: string }, Error>> {
  const upsertResult = await upsertMetronomeAlert({
    alert_type: "low_remaining_contract_credit_and_commit_balance_reached",
    name: `Balance threshold workspace ${workspaceId} (${balanceThresholdCredits} AWU)`,
    threshold: balanceThresholdCredits,
    credit_type_id: getCreditTypeAwuId(),
    customer_id: metronomeCustomerId,
    uniqueness_key: balanceThresholdAlertUniquenessKey(workspaceId),
  });
  if (upsertResult.isErr()) {
    return new Err(upsertResult.error);
  }

  logger.info(
    {
      workspaceId,
      metronomeCustomerId,
      alertId: upsertResult.value.alertId,
      balanceThresholdCredits,
    },
    "[Metronome BalanceThreshold] Synced balance threshold alert"
  );
  return new Ok({ alertId: upsertResult.value.alertId });
}

/**
 * Archive the workspace's balance threshold alert, if any. Idempotent — no-op
 * when no matching alert exists.
 */
export async function clearMetronomeBalanceThresholdAlert({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Result<void, Error>> {
  const result = await clearMetronomeAlert({
    metronomeCustomerId,
    uniquenessKey: balanceThresholdAlertUniquenessKey(workspaceId),
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
      "[Metronome BalanceThreshold] Cleared balance threshold alert"
    );
  }
  return new Ok(undefined);
}
