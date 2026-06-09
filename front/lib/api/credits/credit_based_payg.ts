import type { Authenticator } from "@app/lib/auth";
import {
  clearMetronomeUsageCapAlert,
  upsertMetronomeUsageCapAlert,
} from "@app/lib/metronome/alerts/usage_cap";
import { setAwuContractExcessCreditsAmount } from "@app/lib/metronome/payg_excess_credits";
import { DEFAULT_AWU_EXCESS_RECURRING_AMOUNT } from "@app/lib/metronome/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Apply the credit-based PAYG state to a workspace's Metronome customer.
 *
 * `paygEnabled` and `usageCapCredits` are independent:
 *
 *  - `paygEnabled` controls the AWU recurring "Excess Credits" credit on
 *    every active Metronome contract — zeroed when PAYG is on so overage past
 *    the workspace's free credit pool bills as PAYG instead of being absorbed
 *    silently, restored to the default amount when PAYG is off.
 *  - `usageCapCredits` (strictly positive when set) drives the Metronome
 *    `spend_threshold_reached` alert: upserted when set, cleared when null.
 *    Can be set with or without PAYG enabled.
 *
 * No-op when the workspace has no Metronome customer. The underlying
 * Metronome calls are idempotent.
 */
export async function syncCreditBasedPayg({
  auth,
  paygEnabled,
  usageCapCredits,
}: {
  auth: Authenticator;
  paygEnabled: boolean;
  usageCapCredits: number | null;
}): Promise<Result<undefined, Error>> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return new Ok(undefined);
  }

  const alertResult =
    usageCapCredits !== null
      ? await upsertMetronomeUsageCapAlert({
          metronomeCustomerId: workspace.metronomeCustomerId,
          usageCapCredits,
          workspaceId: workspace.sId,
        })
      : await clearMetronomeUsageCapAlert({
          metronomeCustomerId: workspace.metronomeCustomerId,
          workspaceId: workspace.sId,
        });
  if (alertResult.isErr()) {
    return new Err(
      new Error(
        `Failed to sync Metronome usage cap alert: ${alertResult.error.message}`
      )
    );
  }

  const excessResult = await setAwuContractExcessCreditsAmount({
    metronomeCustomerId: workspace.metronomeCustomerId,
    workspaceId: workspace.sId,
    amount: paygEnabled ? 0 : DEFAULT_AWU_EXCESS_RECURRING_AMOUNT,
  });
  if (excessResult.isErr()) {
    return new Err(
      new Error(
        `Failed to ${paygEnabled ? "disable" : "restore"} AWU recurring excess credits: ${excessResult.error.message}`
      )
    );
  }

  return new Ok(undefined);
}
