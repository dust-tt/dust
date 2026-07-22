import type { ConcreteResourceType, GrantVerb } from "./group_permissions";
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
 * Represents permissions conferred by holding a workspace-level governance capability
 * (a type-wide `group_permissions` grant, e.g. the `write` capability on `space`).
 *
 * Unlike role/group permissions, which are resolved synchronously from the Authenticator's role and
 * group memberships, capabilities live in `group_permissions` and are resolved once at auth
 * construction (see `Authenticator.getWorkspacePermissions`). A resource declares which capability
 * grants it, and which permissions holding that capability confers on that resource.
 *
 * @property resourceType - The governance resource domain of the capability (e.g. "space")
 * @property verb - The verb the caller must hold on `resourceType` (e.g. "globalWrite")
 * @property resourceId - The grant's resource id: WHOLE_TYPE_RESOURCE_ID (-1) for a type-wide
 *   capability, or a resource's model id for an instance grant. A type-wide grant held by the
 *   caller also satisfies an instance requirement.
 * @property permissions - Permissions granted on this resource when the caller holds the capability
 */
export type WorkspacePermissionGrant = {
  resourceType: ConcreteResourceType;
  verb: GrantVerb;
  resourceId: number;
  permissions: PermissionType[];
};

/**
 * Defines combined group, role, and workspace-capability-based permissions for a resource.
 */
export type CombinedResourcePermissions = {
  groups: GroupPermission[];
  roles: RolePermission[];
  workspacePermissions?: WorkspacePermissionGrant[];
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
