import type { Authenticator } from "@app/lib/auth";
import {
  clearMetronomeBalanceThresholdAlert,
  upsertMetronomeBalanceThresholdAlert,
} from "@app/lib/metronome/alerts/balance_threshold";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Apply the workspace's credit-balance-threshold notification settings to its
 * Metronome customer.
 *
 * The `low_remaining_commit_balance_reached` alert is upserted only when the
 * warning is enabled (`disableCreditCapWarning === false`) and a strictly
 * positive `balanceThresholdCredits` is configured; otherwise it's cleared.
 * A threshold of 0 (the default when nothing is configured) means "no alert".
 *
 * No-op when the workspace has no Metronome customer. The underlying Metronome
 * calls are idempotent.
 */
export async function syncMetronomeBalanceThresholdAlert({
  auth,
  disableCreditCapWarning,
  balanceThresholdCredits,
}: {
  auth: Authenticator;
  disableCreditCapWarning: boolean;
  balanceThresholdCredits: number | null;
}): Promise<Result<undefined, Error>> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return new Ok(undefined);
  }

  const shouldAlert =
    !disableCreditCapWarning &&
    balanceThresholdCredits !== null &&
    balanceThresholdCredits > 0;

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
