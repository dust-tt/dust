import type { ConcreteResourceType } from "./group_permissions";
import type { ModelId } from "./shared/model_id";
import type { RoleType } from "./user";

// Supported operations for resource permissions.
export const SUPPORTED_OPERATIONS = ["admin", "read", "write"] as const;

export type PermissionType = (typeof SUPPORTED_OPERATIONS)[number];

/**
 * Legacy: permissions assigned to a specific group, listed inline on a resource's permission
 * config. Being migrated to the `group_permissions` table (see `CombinedResourcePermissions`'s
 * governance-grant channel); prefer that path for new code.
 *
 * @property id - Unique identifier for the group (ModelId type)
 * @property permissions - Array of permissions granted to the group
 */
export type LegacyGroupPermission = {
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
 * Legacy: group-based permissions for a resource, managed through inline group assignments.
 * Superseded by the `group_permissions` governance-grant channel.
 */
export type LegacyGroupResourcePermissions = {
  groups: LegacyGroupPermission[];
};

/**
 * Defines combined group, role, and governance-grant-based permissions for a resource.
 *
 * When `resourceType` is set, the resource is also checked against the caller's `group_permissions`
 * grants (resolved at auth construction — see `Authenticator.resolvePermissions`): the caller
 * passes if they hold the requested permission, used directly as a grant verb since
 * `PermissionType` ⊆ `GrantVerb`, on this `(resourceType, resourceId)`. `resourceId` defaults to
 * the type-wide grant when omitted, and a type-wide grant also satisfies an instance requirement
 * (see `PermissionSet.has`).
 *
 * @property groups - Legacy inline group-based grants: a caller in a listed group gets its
 *   permissions (being migrated to the governance-grant channel below)
 * @property roles - Role-based grants: a caller whose workspace role matches gets its permissions
 * @property resourceType - The governance resource domain to check (e.g. "space")
 * @property resourceId - The resource's model id; omitted means the type-wide (-1) grant
 * @property workspaceId - The resource's workspace; role and governance-grant checks only apply
 *   when it matches the caller's workspace
 */
export type CombinedResourcePermissions = {
  groups: LegacyGroupPermission[];
  roles: RolePermission[];
  resourceType?: ConcreteResourceType;
  resourceId?: number;
  workspaceId: ModelId;
};

/**
 * Represents the complete permission configuration for a resource.
 * Can be either:
 * - Group-based permissions only
 * - Both group and role-based permissions combined
 */
export type ResourcePermission =
  | LegacyGroupResourcePermissions
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
