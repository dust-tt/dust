import type { Authenticator } from "@app/lib/auth";
import {
  clearMetronomeBalanceThresholdAlert,
  getCachedWorkspaceBalanceThreshold,
  upsertMetronomeBalanceThresholdAlert,
} from "@app/lib/metronome/alerts/balance_threshold";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Read the workspace's credit-balance-threshold notification setting.
 *
 * Metronome is the source of truth: the setting is the threshold of the
 * workspace's balance-threshold alert (cached in Redis). Returns `null` when no
 * threshold is configured, or when the workspace has no Metronome customer.
 */
export async function getWorkspaceBalanceThreshold(
  auth: Authenticator
): Promise<number | null> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return null;
  }

  const { threshold } = await getCachedWorkspaceBalanceThreshold({
    metronomeCustomerId: workspace.metronomeCustomerId,
    workspaceId: workspace.sId,
  });
  return threshold;
}

/**
 * Persist the workspace's credit-balance-threshold notification setting to its
 * Metronome customer.
 *
 * A strictly positive `balanceThresholdCredits` upserts the balance-threshold
 * alert; 0 or null clears it (the warning is "off"). No-op when the workspace
 * has no Metronome customer. The underlying Metronome calls are idempotent.
 */
export async function syncMetronomeBalanceThresholdAlert({
  auth,
  balanceThresholdCredits,
}: {
  auth: Authenticator;
  balanceThresholdCredits: number | null;
}): Promise<Result<undefined, Error>> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return new Ok(undefined);
  }

  const shouldAlert =
    balanceThresholdCredits !== null && balanceThresholdCredits > 0;

  const alertResult = shouldAlert
    ? await upsertMetronomeBalanceThresholdAlert({
        metronomeCustomerId: workspace.metronomeCustomerId,
        balanceThresholdCredits,
        workspaceId: workspace.sId,
      })
    : await clearMetronomeBalanceThresholdAlert({
        metronomeCustomerId: workspace.metronomeCustomerId,
        workspaceId: workspace.sId,
      });
  if (alertResult.isErr()) {
    return new Err(
      new Error(
        `Failed to sync Metronome balance threshold alert: ${alertResult.error.message}`
      )
    );
  }

  return new Ok(undefined);
}
