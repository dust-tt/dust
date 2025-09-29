import type { ModelId } from "./shared/model_id";
import type { RoleType } from "./user";

// Supported operations for resource permissions.
const SUPPORTED_OPERATIONS = ["admin", "read", "write"] as const;

export type PermissionType = (typeof SUPPORTED_OPERATIONS)[number];

/**
 * Represents permissions assigned to a specific group.
 *
 * @property id - Unique identifier for the group (ModelId type)
 * @property permissions - Array of permissions granted to the group
 */
export type GroupPermission = {
  id: ModelId;
  permissions: PermissionType[];
};

/**
 * Represents permissions assigned to a specific role.
 *
 * @property role - The type of role (RoleType)
 * @property permissions - Array of permissions granted to the role
 */
export type RolePermission = {
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
 * Defines combined group and role-based permissions for a resource.
 */
export type CombinedResourcePermissions = {
  groups: GroupPermission[];
  roles: RolePermission[];
  workspaceId: ModelId;
};

/**
 * Represents the complete permission configuration for a resource.
 * Can be either:
 * - Group-based permissions only
 * - Both group and role-based permissions combined
 */
export type ResourcePermission =
  | GroupResourcePermissions
  | CombinedResourcePermissions;

/**
 * Type guard to determine if a permission configuration includes role-based access control.
 *
 * @param resourcePermission - The resource permission configuration to check
 * @returns True if the configuration includes role-based permissions
 */
export function hasRolePermissions(
  resourcePermission: ResourcePermission
): resourcePermission is CombinedResourcePermissions {
  return "roles" in resourcePermission;
}
