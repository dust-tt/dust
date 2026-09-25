import type { Authenticator } from "@app/lib/auth";
import type { GroupResource } from "@app/lib/resources/group_resource";
import type { GroupAllowedActions } from "@app/types/api/groups";
import { isManageableGroupKind } from "@app/types/groups";

/**
 * @cc [owner:philipperolet,label:security;api] advertised-group-actions
 * A group response MUST advertise only actions allowed by current server permissions. Delegated
 * actions MUST be hidden while group_management is off; provisioned and admin-granting group
 * membership restrictions still apply. This is UI guidance, not mutation authorization.
 */
export function getGroupAllowedActions(
  auth: Authenticator,
  group: GroupResource,
  isGroupManagementEnabled: boolean
): GroupAllowedActions {
  const canUseDelegation =
    isGroupManagementEnabled || auth.isManager() || auth.isAdmin();

  return {
    canEditMembers:
      canUseDelegation &&
      auth.can("write", group) &&
      group.canManageMembersGivenGrantedRole(auth),
    canEditDetails: auth.can("admin", group),
    canReadUsage: canUseDelegation && auth.can("read_usage", group),
    canSetUsageLimits: canUseDelegation && auth.can("set_usage_limits", group),
    canAssignManagers:
      isGroupManagementEnabled &&
      auth.isAdmin() &&
      isManageableGroupKind(group.kind),
  };
}
