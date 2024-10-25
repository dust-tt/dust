import { ModelId } from "../shared/model_id";
import { RoleType } from "./user";

// Supported operations for resource permissions.
export const SUPPORTED_OPERATIONS = ["admin", "read", "write"] as const;

export type PermissionType = (typeof SUPPORTED_OPERATIONS)[number];

/**
 * Represents permissions assigned to a specific group.
 *
 * @property id - Unique identifier for the group (ModelId type)
 * @property permissions - Array of permissions granted to the group
 */
type GroupPermission = {
  id: ModelId;
  permissions: PermissionType[];
};

/**
 * Represents permissions assigned to a specific role.
 *
 * @property role - The type of role (RoleType)
 * @property permissions - Array of permissions granted to the role
 */
type RolePermission = {
  role: RoleType;
  permissions: PermissionType[];
};

/**
 * Defines group-based permissions for a resource.
 * Used when access control is managed through group assignments.
 */
export type GroupResourcePermissions = {
  groups: GroupPermission[];
};

/**
 * Defines role-based permissions for a resource.
 * Used when access control is managed through role assignments.
 *
 * @property roles - Array of role permissions
 * @property workspaceId - Required identifier for workspace-scoped roles
 */
export type RoleResourcePermissions = {
  roles: RolePermission[];
  workspaceId: ModelId; // Required when roles are defined.
};

/**
 * Represents the complete permission configuration for a resource.
 * Can be either:
 * - Group-based permissions only
 * - Both group and role-based permissions combined
 */
export type ResourcePermission =
  | GroupResourcePermissions
  | (GroupResourcePermissions & RoleResourcePermissions);

/**
 * Type guard to determine if a permission configuration includes role-based access control.
 *
 * @param acl - The resource permission configuration to check
 * @returns True if the configuration includes role-based permissions
 */
export function hasRolePermissions(
  acl: ResourcePermission
): acl is GroupResourcePermissions & RoleResourcePermissions {
  return "roles" in acl;
}
