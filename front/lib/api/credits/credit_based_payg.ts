import type { Authenticator } from "@app/lib/auth";
import {
  clearMetronomePaygCapAlert,
  upsertMetronomePaygCapAlert,
} from "@app/lib/metronome/payg_alerts";
import { setAwuContractExcessCreditsAmount } from "@app/lib/metronome/payg_excess_credits";
import { DEFAULT_AWU_EXCESS_RECURRING_AMOUNT } from "@app/lib/metronome/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Apply the credit-based PAYG state to a workspace's Metronome customer.
 *
 * `paygCapCredits === null` means PAYG is disabled; any strictly-positive
 * value means PAYG is enabled at that cap. The function:
 *
 *  - upserts (enabled) or clears (disabled) the Metronome
 *    `spend_threshold_reached` alert,
 *  - zeroes (enabled) or restores (disabled) the AWU recurring "Excess
 *    Credits" credit on every active Metronome contract — when enabled
 *    overage past the workspace's free credit pool bills as PAYG instead
 *    of being absorbed silently.
 *
 * No-op when the workspace has no Metronome customer. The underlying
 * Metronome calls are idempotent.
 */
export async function syncCreditBasedPayg({
  auth,
  paygCapCredits,
}: {
  auth: Authenticator;
  paygCapCredits: number | null;
}): Promise<Result<undefined, Error>> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return new Ok(undefined);
  }

  const enabled = paygCapCredits !== null;

  const alertResult = enabled
    ? await upsertMetronomePaygCapAlert({
        metronomeCustomerId: workspace.metronomeCustomerId,
        paygCapCredits,
        workspaceId: workspace.sId,
      })
    : await clearMetronomePaygCapAlert({
        metronomeCustomerId: workspace.metronomeCustomerId,
        workspaceId: workspace.sId,
      });
  if (alertResult.isErr()) {
    return new Err(
      new Error(
        `Failed to sync Metronome PAYG cap alert: ${alertResult.error.message}`
      )
    );
  }

  const excessResult = await setAwuContractExcessCreditsAmount({
    metronomeCustomerId: workspace.metronomeCustomerId,
    workspaceId: workspace.sId,
    amount: enabled ? 0 : DEFAULT_AWU_EXCESS_RECURRING_AMOUNT,
  });
  if (excessResult.isErr()) {
    return new Err(
      new Error(
        `Failed to ${enabled ? "disable" : "restore"} AWU recurring excess credits: ${excessResult.error.message}`
      )
    );
  }

  return new Ok(undefined);
}
