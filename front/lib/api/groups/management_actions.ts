import type { Authenticator } from "@app/lib/auth";
import type { GroupResource } from "@app/lib/resources/group_resource";
import type { GroupAllowedActions } from "@app/types/api/groups";
import { isManageableGroupKind } from "@app/types/groups";

/**
 * @cc [owner:philipperolet,label:security;api] advertised-group-actions
 * A group response MUST advertise only actions allowed by current server permissions, including
 * membership restrictions for provisioned and privileged groups. This is UI guidance, not
 * mutation authorization.
 */
export function getGroupAllowedActions(
  auth: Authenticator,
  group: GroupResource
): GroupAllowedActions {
  return {
    canEditMembers: auth.can("write", group),
    canEditDetails: auth.can("admin", group),
    canReadUsage: auth.can("read_usage", group),
    canSetUsageLimits: auth.can("set_usage_limits", group),
    canAssignManagers: auth.isManager() && isManageableGroupKind(group.kind),
  };
}
