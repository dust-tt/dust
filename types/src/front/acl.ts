import { ModelId } from "../shared/model_id";
import { GroupType } from "./groups";
import { LightWorkspaceType, UserRole } from "./user";

// Supported permissions
export const SUPPORTED_PERMISSIONS = ["admin", "read", "write"] as const;

export type Permission = (typeof SUPPORTED_PERMISSIONS)[number];

export type GroupPermission = {
  id: ModelId;
  permissions: Permission[];
};

export type RolePermission = {
  name: UserRole;
  permissions: Permission[];
};

export type GroupOnlyACL = {
  groups: GroupPermission[];
  roles?: never[];
};

export type RoleBasedACL = {
  groups: GroupPermission[];
  roles: RolePermission[];
  workspaceId: ModelId; // Required when roles are defined.
};

function hasRoles(acl: ACLType): acl is RoleBasedACL {
  return "roles" in acl;
}

export type ACLType = GroupOnlyACL | RoleBasedACL;

/**
 * Determines if a user has a specific permission on a resource based on their role and group memberships.
 *
 * Permission is granted if either:
 * 1. Role-based access:
 *    - Resource has role-based ACLs
 *    - Either:
 *      • Resource has public access for the permission
 *      • User's role has the permission AND resource belongs to user's workspace
 * 2. Group-based access:
 *    - User belongs to a group that has the permission
 */
export function hasResourcePermission(
  acl: ACLType,
  workspace: LightWorkspaceType,
  permission: Permission,
  groups: GroupType[],
  userRole: UserRole
): boolean {
  // Check role-based permissions if applicable.
  if (hasRoles(acl)) {
    // Public access check (across all workspaces).
    const publicPermission = acl.roles
      .find((r) => r.name === "none")
      ?.permissions.includes(permission);
    if (publicPermission) {
      return true;
    }

    // Workspace-specific role permission check.
    const hasRolePermission = acl.roles.some(
      (r) => userRole === r.name && r.permissions.includes(permission)
    );

    if (hasRolePermission && workspace.id === acl.workspaceId) {
      return true;
    }
  }

  // Group-based permission check.
  return groups.some((userGroup) =>
    acl.groups.some(
      (aclGroup) =>
        aclGroup.id === userGroup.id &&
        aclGroup.permissions.includes(permission)
    )
  );
}
