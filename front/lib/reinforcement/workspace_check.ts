import { getLargeWhitelistedModelWithBatchMode } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";

/**
 * Check whether reinforcement is enabled for the workspace:
 * - the `reinforced_agents` feature flag must be active, AND
 * - the workspace must have opted in via `allowReinforcement` metadata.
 */
export async function hasReinforcementEnabled(
  auth: Authenticator
): Promise<boolean> {
  if (!(await hasFeatureFlag(auth, "reinforced_agents"))) {
    return false;
  }

  const workspace = auth.getNonNullableWorkspace();
  return workspace.metadata?.allowReinforcement === true;
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
