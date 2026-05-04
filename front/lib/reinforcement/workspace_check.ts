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
export async function isReinforcementBatchModeAllowed(
  auth: Authenticator
): Promise<boolean> {
  // Vertex AI does not currently support batch processing.
  if (await hasFeatureFlag(auth, "use_vertex_for_claude_models")) {
    return false;
  }

  const workspace = auth.getNonNullableWorkspace();
  return workspace.metadata?.allowReinforcementBatchMode !== false;
}
