import type { PlanType } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * SSO is available when the plan allows it, or when it has been activated
 * on demand for the workspace (workspace metadata `allowSSO`, set via the
 * "Toggle SSO Activation" poke plugin).
 */
export function isSSOAllowedForWorkspace(
  owner: LightWorkspaceType,
  plan: PlanType
): boolean {
  return plan.limits.users.isSSOAllowed || owner.metadata?.allowSSO === true;
}
