import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";

/**
 * Check whether reinforcement is enabled for the workspace:
 * - the `reinforced_agents` feature flag must be active, AND
 * - the workspace must not have opted out via `allowReinforcement` metadata.
 */
export async function hasReinforcementEnabled(
  auth: Authenticator
): Promise<boolean> {
  if (!(await hasFeatureFlag(auth, "reinforced_agents"))) {
    return false;
  }

  const workspace = auth.getNonNullableWorkspace();
  return workspace.metadata?.allowReinforcement !== false;
}

/**
 * Check whether batch mode is allowed for reinforcement in this workspace.
 * Defaults to true when not explicitly set.
 */
export function isReinforcementBatchModeAllowed(auth: Authenticator): boolean {
  const workspace = auth.getNonNullableWorkspace();
  return workspace.metadata?.allowReinforcementBatchMode !== false;
}
