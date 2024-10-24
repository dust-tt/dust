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

export function hasRoleBasedPermissions(acl: ACLType): acl is RoleBasedACL {
  return "roles" in acl;
}

export type ACLType = GroupOnlyACL | RoleBasedACL;
