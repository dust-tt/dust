import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { getReinforcementBillingUnit } from "@app/lib/reinforcement/enforcement";
import { getLargeWhitelistedModelWithBatchMode } from "@app/lib/reinforcement/models";

/**
 * Check whether reinforcement is enabled for the workspace:
 * - the `reinforced_agents` feature flag must be active, or the workspace must
 *   be billed by Metronome on a credit-priced plan, AND
 * - the workspace must have opted in via `allowReinforcement` metadata.
 */
export async function hasReinforcementEnabled(
  auth: Authenticator
): Promise<boolean> {
  const workspace = auth.getNonNullableWorkspace();
  if (workspace.metadata?.allowReinforcement !== true) {
    return false;
  }

  if (getReinforcementBillingUnit(auth) === "awu_credits") {
    return true;
  }

  return hasFeatureFlag(auth, "reinforced_agents");
}

/**
 * Check whether batch mode is allowed for reinforcement in this workspace.
 * Requires a batch-capable model to be available and the workspace setting to allow it.
 */
export async function isReinforcementBatchModeAllowed(
  auth: Authenticator
): Promise<boolean> {
  const model = await getLargeWhitelistedModelWithBatchMode(auth);
  if (!model) {
    return false;
  }

  const workspace = auth.getNonNullableWorkspace();
  return workspace.metadata?.allowReinforcementBatchMode !== false;
}
