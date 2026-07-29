import type { ConcreteResourceType, GrantVerb } from "./group_permissions";
import type { ModelId } from "./shared/model_id";
import type { RoleType } from "./user";

/**
 * Legacy: permissions assigned to a specific group, listed inline on a resource's permission
 * config. Being migrated to the `group_permissions` table (see `GrantedAccessRule`); prefer
 * that path for new code.
 *
 * @property id - Unique identifier for the group (ModelId type)
 * @property permissions - Grant verbs granted to the group
 */
export type InlineGroupGrant = {
  id: ModelId;
  permissions: GrantVerb[];
};

/**
 * Represents permissions assigned to a specific role.
 *
 * @property role - The type of role (RoleType)
 * @property permissions - Grant verbs granted to the role
 */
export type RoleGrant = {
  role: RoleType;
  permissions: GrantVerb[];
};

/**
 * Legacy: group-based permissions for a resource, managed through inline group assignments.
 * Superseded by the `group_permissions` governance-grant channel.
 */
export type LegacyGroupAccessRule = {
  groups: InlineGroupGrant[];
};

/**
 * Legacy: role-based grants plus inline group grants for a resource, with no `group_permissions`
 * table involvement. Being migrated to `GrantedAccessRule`.
 *
 * @property groups - Legacy inline group-based grants: a caller in a listed group gets its
 *   permissions
 * @property roles - Role-based grants: a caller whose workspace role matches gets its permissions
 * @property workspaceId - The resource's workspace; role and legacy-group checks only apply when it
 *   matches the caller's workspace
 */
export type LegacyAccessRule = {
  groups: InlineGroupGrant[];
  roles: RoleGrant[];
  workspaceId: ModelId;
};

/**
 * Role-based grants plus the `group_permissions` table (the governance-grant channel). The resource
 * is identified by `(resourceType, resourceId)`; a caller passes if their role grants the requested
 * verb, or if they hold it as a grant on that resource — grants are resolved at auth construction
 * (see `Authenticator.resolvePermissions`). `resourceId`
 * omitted means the type-wide (-1) grant, and a type-wide grant satisfies an instance requirement
 * (see `PermissionSet.has`).
 *
 * @property roles - Role-based grants: a caller whose workspace role matches gets its permissions
 * @property resourceType - The governance resource domain to check (e.g. "space")
 * @property resourceId - The resource's model id; omitted means the type-wide (-1) grant
 * @property workspaceId - The resource's workspace; the role and governance-grant checks only apply
 *   when it matches the caller's workspace
 */
export type GrantedAccessRule = {
  roles: RoleGrant[];
  resourceType: ConcreteResourceType;
  resourceId?: number;
  workspaceId: ModelId;
};

/**
 * Represents the complete permission configuration for a resource. One of:
 * - Legacy inline group-based permissions only (`LegacyGroupAccessRule`)
 * - Legacy roles + inline groups (`LegacyAccessRule`)
 * - Roles + the group_permissions table (`GrantedAccessRule`)
 */
export type AccessRule =
  | LegacyGroupAccessRule
  | LegacyAccessRule
  | GrantedAccessRule;

/**
 * Type guard to determine if a permission configuration includes role-based access control.
 *
 * @param resourcePermission - The resource permission configuration to check
 * @returns True if the configuration includes role-based permissions
 */
export function hasRoleGrants(
  resourcePermission: AccessRule
): resourcePermission is LegacyAccessRule | GrantedAccessRule {
  return "roles" in resourcePermission;
}
