import { ModelId } from "../shared/model_id";
import { RoleType } from "./user";

// Supported permissions
export const SUPPORTED_PERMISSIONS = ["admin", "read", "write"] as const;

export type Permission = (typeof SUPPORTED_PERMISSIONS)[number];

export type GroupPermission = {
  id: ModelId;
  permissions: Permission[];
};

export type RolePermission = {
  name: RoleType;
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

export type GroupAndRoleACL = GroupOnlyACL | RoleBasedACL;

export function hasRoleBasedPermissions(
  acl: GroupAndRoleACL
): acl is RoleBasedACL {
  return "roles" in acl;
}
