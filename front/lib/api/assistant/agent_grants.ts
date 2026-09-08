import { isLegacyAclsEnabled } from "@app/lib/api/permissions/legacy_acls";
import type { Authenticator } from "@app/lib/auth";

/**
 * @cc [owner:philipperolet,label:security] agent-read-rollout
 * All agent editor and permission reads use grants only when `agent_permission_grants` is
 * enabled and `use_legacy_acls` is off; grant read failures must propagate without legacy fallback.
 */
export async function areAgentGrantsEnabled(
  auth: Authenticator
): Promise<boolean> {
  return (
    !isLegacyAclsEnabled() && auth.hasFeatureFlag("agent_permission_grants")
  );
}
