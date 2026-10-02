import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { GroupAllowedActions } from "@app/types/api/groups";
import { isManageableGroupKind } from "@app/types/groups";

function buildGroupAllowedActions(
  auth: Authenticator,
  group: GroupResource,
  {
    isGroupManagementEnabled,
    canManageMembers,
  }: { isGroupManagementEnabled: boolean; canManageMembers: boolean }
): GroupAllowedActions {
  const canUseDelegation =
    isGroupManagementEnabled || auth.isManager() || auth.isAdmin();

  return {
    canEditMembers:
      canUseDelegation && auth.can("write", group) && canManageMembers,
    canEditDetails: auth.can("admin", group),
    canReadUsage: canUseDelegation && auth.can("read_usage", group),
    canSetUsageLimits: canUseDelegation && auth.can("set_usage_limits", group),
    canAssignManagers:
      isGroupManagementEnabled &&
      auth.isManager() &&
      isManageableGroupKind(group.kind),
  };
}

/**
 * @cc [owner:philipperolet;rfrenoy,label:security;api] advertised-group-actions
 * A group response MUST advertise only actions allowed by current server permissions. Delegated
 * actions MUST be hidden while group_management is off; provisioned and admin-only membership
 * group restrictions (`admin-group-membership-admin-only`) still apply, so `canEditMembers` MUST
 * be false for non-admins on those groups. This is UI guidance, not mutation authorization.
 */
export async function getGroupAllowedActions(
  auth: Authenticator,
  group: GroupResource,
  isGroupManagementEnabled: boolean
): Promise<GroupAllowedActions> {
  return buildGroupAllowedActions(auth, group, {
    isGroupManagementEnabled,
    canManageMembers: await group.canManageMembers(auth),
  });
}

/**
 * Batched `getGroupAllowedActions` for list responses, keyed by group sId: the admin-only
 * membership lookup runs once for all groups.
 */
export async function getGroupsAllowedActions(
  auth: Authenticator,
  groups: GroupResource[],
  isGroupManagementEnabled: boolean
): Promise<Map<string, GroupAllowedActions>> {
  const adminOnlyGroupModelIds =
    await GroupResource.listAdminOnlyMembershipGroupModelIds(auth, groups);
  return new Map(
    groups.map((group) => [
      group.sId,
      buildGroupAllowedActions(auth, group, {
        isGroupManagementEnabled,
        canManageMembers: !adminOnlyGroupModelIds.has(group.id),
      }),
    ])
  );
}
