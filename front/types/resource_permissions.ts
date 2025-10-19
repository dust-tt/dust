import type { ModelId } from "./shared/model_id";
import type { RoleType } from "./user";

// Supported operations for resource permissions.
export const SUPPORTED_OPERATIONS = ["admin", "read", "write"] as const;

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
 * Represents permissions assigned to a specific space.
 *
 * @property id - Unique identifier for the space (ModelId type)
 * @property permissions - Array of permissions granted to the space
 */
export type SpacePermission = {
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
 * Defines space-based permissions for a resource.
 * Used when access control is managed through space assignments.
 */
export type SpaceResourcePermissions = {
  space: SpacePermission;
};

/**
 * Represents the complete permission configuration for a resource.
 * Can be either:
 * - Group-based permissions only
 * - Space-based permissions
 * - Both group and role-based permissions combined
 */
export type ResourcePermission =
  | GroupResourcePermissions
  | SpaceResourcePermissions
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

/**
 * Type guard to determine if a permission configuration includes group-based access control.
 *
 * @param resourcePermission - The resource permission configuration to check
 * @returns True if the configuration includes group-based permissions
 */
export function hasGroupPermissions(
  resourcePermission: ResourcePermission
): resourcePermission is
  | GroupResourcePermissions
  | CombinedResourcePermissions {
  return "groups" in resourcePermission && resourcePermission.groups.length > 0;
}

/**
 * Type guard to determine if a permission configuration is space-based.
 *
 * @param resourcePermission - The resource permission configuration to check
 * @returns True if the configuration is space-based permissions
 */
export function hasSpacePermissions(
  resourcePermission: ResourcePermission
): resourcePermission is SpaceResourcePermissions {
  return "space" in resourcePermission;
}
