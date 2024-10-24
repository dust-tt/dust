import { ModelId } from "../shared/model_id";
import { GroupType } from "./groups";
import { LightWorkspaceType, UserRole } from "./user";

// Supported permissions
export const SUPPORTED_PERMISSIONS = [
  "admin",
  "list",
  "read",
  "write",
] as const;

export type Permission = (typeof SUPPORTED_PERMISSIONS)[number];

export type GroupPermission = {
  id: ModelId;
  permissions: Permission[];
};

export type RolePermission = {
  name: UserRole | "public";
  permissions: Permission[];
};

export type ACLType = {
  groups: GroupPermission[];
  roles: RolePermission[];
  workspaceId: ModelId;
};

export function hasResourcePermission(
  acl: ACLType,
  workspace: LightWorkspaceType,
  permission: Permission,
  groups: GroupType[],
  userRole: UserRole
): boolean {
  // Check if there's a public permission.
  const publicPermission = acl.roles
    .find((r) => r.name === "public")
    ?.permissions.includes(permission);
  if (publicPermission) {
    return true;
  }

  // Check if the user belongs to a group with the permission.
  const hasGroupPermission = groups.some((userGroup) =>
    acl.groups.some(
      (aclGroup) =>
        aclGroup.id === userGroup.id &&
        aclGroup.permissions.includes(permission)
    )
  );
  if (hasGroupPermission) {
    return true;
  }

  // Otherwise, check if the user has the permission based on their role in the workspace.
  const hasRolePermission = acl.roles.some(
    (r) => userRole === r.name && r.permissions.includes(permission)
  );

  if (hasRolePermission && workspace.id === acl.workspaceId) {
    return true;
  }

  return false;
}
