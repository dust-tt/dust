import {
  clearMetronomeAlert,
  findMetronomeAlert,
  upsertMetronomeAlert,
} from "@app/lib/metronome/alerts";
import {
  CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY,
  CONTRACT_CREDIT_TYPE_POOL,
  getCreditTypeAwuId,
} from "@app/lib/metronome/constants";
import {
  bestEffortInvalidateCacheWithRedis,
  cacheWithRedis,
} from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

// Persisted as the alert uniqueness key on Metronome's side. Changing it would
// orphan any existing alert (the new key wouldn't match, so
// `clearMetronomeBalanceThresholdAlert` would silently no-op for workspaces
// that have a pre-rename alert).
export function balanceThresholdAlertUniquenessKey(
  workspaceId: string
): string {
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
    custom_field_filters: [
      {
        entity: "ContractCredit",
        key: CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY,
        value: CONTRACT_CREDIT_TYPE_POOL,
      },
      {
        entity: "Commit",
        key: CONTRACT_CREDIT_TYPE_CUSTOM_FIELD_KEY,
        value: CONTRACT_CREDIT_TYPE_POOL,
      },
    ],
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
  await invalidateCachedWorkspaceBalanceThreshold({
    metronomeCustomerId,
    workspaceId,
  });
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
  await invalidateCachedWorkspaceBalanceThreshold({
    metronomeCustomerId,
    workspaceId,
  });
  return new Ok(undefined);
}

const BALANCE_THRESHOLD_CACHE_TTL_MS = 60 * 1000;

const balanceThresholdCacheResolver = ({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}) => `${metronomeCustomerId}-${workspaceId}`;

async function fetchWorkspaceBalanceThreshold({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<{ threshold: number | null; alertId: string | null }> {
  const result = await findMetronomeAlert({
    metronomeCustomerId,
    uniquenessKey: balanceThresholdAlertUniquenessKey(workspaceId),
  });
  if (result.isErr()) {
    throw result.error;
  }
  return {
    threshold: result.value?.alert.threshold ?? null,
    alertId: result.value?.alert.id ?? null,
  };
}

/**
 * Read the workspace's configured balance threshold (in AWU credits) and the id
 * of its Metronome alert, cached in Redis. Returns `null` fields when no alert
 * is configured. Metronome is the source of truth — there is no DB copy. The
 * `alertId` lets webhook handling confirm that an incoming alert event
 * corresponds to this workspace-configured alert.
 */
export const getCachedWorkspaceBalanceThreshold = cacheWithRedis(
  fetchWorkspaceBalanceThreshold,
  balanceThresholdCacheResolver,
  { ttlMs: BALANCE_THRESHOLD_CACHE_TTL_MS }
);

const invalidateCachedWorkspaceBalanceThreshold =
  bestEffortInvalidateCacheWithRedis(
    fetchWorkspaceBalanceThreshold,
    balanceThresholdCacheResolver,
    "workspace balance threshold"
  );
