/**
 * Vocabulary for the `group_permissions` table (Admin Governance §1A).
 *
 * A grant row stores a registry-defined *grant type* — a role such as `member`/`editor`, or a
 * singleton capability such as `create`/`use` — for a `resourceType` and a numeric `resourceId`.
 * Which roles are valid for a (grantType, resourceType, resourceId) combination, and the verbs each
 * role grants, are defined by the registry in `@app/lib/resources/group_permission_registry`. This
 * file defines the raw vocabulary and the "whole type" sentinel.
 */

// Verbs are the granular capabilities a role grants. They are never stored — roles map to them in
// the registry, and capability questions are expressed in verbs.
//
// A verb's position in this array is its bit in the `PermissionSet` bitmask (verb at index i => bit
// `1 << i`; see `group_permission_registry`). Consequences:
// - Never reorder or remove a verb: it would silently reassign every subsequent verb's bit and
//   change the meaning of already-computed masks.
// - Add new verbs only at the end.
// - Keep the total at most 31 verbs: JS bitwise operators work on 32-bit integers, so beyond that
//   the shift overflows and masks break.
export const GRANT_VERBS = [
  "read",
  "write",
  "admin",
  "create",
  "publish",
  "invite",
  "use",
  "make_discoverable",
] as const;
export type GrantVerb = (typeof GRANT_VERBS)[number];

// Grant types are the registry-defined role names stored in a grant row. "*" means "all grant
// types". Each role's verbs and levels live in the registry.
export const GRANT_TYPES = [
  "reader",
  "member",
  "admin",
  "editor",
  "create",
  "publish",
  "invite",
  "use",
  "make_discoverable",
  "*",
] as const;
export type GrantType = (typeof GRANT_TYPES)[number];

// Resource domains. "*" means "all resource types".
export const GROUP_PERMISSION_RESOURCE_TYPES = [
  "space",
  "agent",
  "skill",
  "frame",
  "billing",
  "security",
  "models_tier",
  "dust_app",
  "group",
  "*",
] as const;
export type GroupPermissionResourceType =
  (typeof GROUP_PERMISSION_RESOURCE_TYPES)[number];

// Concrete (non-wildcard) vocabulary — everything except the "*" wildcard.
export type ConcreteResourceType = Exclude<GroupPermissionResourceType, "*">;

// `resourceId = -1` means "the type as a whole": for instance-level roles, all resources of the
// type; for type-level roles (e.g. the `create` capability), the only sensible value. There is
// deliberately no NULL anywhere — one meaning, one representation — and the unique index dedupes
// wildcard rows.
export const WHOLE_TYPE_RESOURCE_ID = -1;

export function isGrantType(value: unknown): value is GrantType {
  return GRANT_TYPES.some((permission) => permission === value);
}

export function isGroupPermissionResourceType(
  value: unknown
): value is GroupPermissionResourceType {
  return GROUP_PERMISSION_RESOURCE_TYPES.some(
    (resourceType) => resourceType === value
  );
}

export function isConcreteResourceType(
  resourceType: GroupPermissionResourceType
): resourceType is ConcreteResourceType {
  return resourceType !== "*";
}

const PERMISSION_CONFIGURATION_SCOPES = [
  "everyone",
  "groups",
  "admins_only",
] as const;

export type PermissionConfigurationScope =
  (typeof PERMISSION_CONFIGURATION_SCOPES)[number];

export const isValidPermissionConfigurationScope = (
  scope: string
): scope is PermissionConfigurationScope => {
  return PERMISSION_CONFIGURATION_SCOPES.some(
    (validScope) => validScope === scope
  );
};

export type GovernancePermissionConfiguration =
  | {
      scope: Extract<PermissionConfigurationScope, "groups">;
      groupIds: string[];
    }
  | {
      scope: Exclude<PermissionConfigurationScope, "groups">;
    };

export type GovernancePermission = {
  grantType: GrantType;
  resourceType: GroupPermissionResourceType;
  configuration: GovernancePermissionConfiguration;
};

// A governance capability: a (grantType, resourceType) pair, without its configuration.
export type CapabilitySpec = Pick<
  GovernancePermission,
  "grantType" | "resourceType"
>;

// The workspace-level (type-wide) verbs a caller holds, grouped by resource type.
export type WorkspacePermissions = Record<ConcreteResourceType, GrantVerb[]>;

export function emptyWorkspacePermissions(): WorkspacePermissions {
  return {
    space: [],
    agent: [],
    skill: [],
    frame: [],
    billing: [],
    security: [],
    models_tier: [],
    dust_app: [],
    group: [],
  };
}

// Stable string key for a governance capability.
export type CapabilityKey = `${GrantType}:${GroupPermissionResourceType}`;

// The single source of truth for the capability-key format; used to key capability-state maps.
export function capabilityKey({
  grantType,
  resourceType,
}: CapabilitySpec): CapabilityKey {
  return `${grantType}:${resourceType}`;
}

/**
 * Catalog of the governance capabilities the Settings & Governance page manages, grouped by the
 * section they belong to.
 */
export const GOVERNANCE_CAPABILITIES = {
  agent: [
    { grantType: "create", resourceType: "agent" },
    { grantType: "publish", resourceType: "agent" },
  ],
  skill: [
    { grantType: "create", resourceType: "skill" },
    { grantType: "publish", resourceType: "skill" },
    { grantType: "make_discoverable", resourceType: "skill" },
  ],
  frame: [
    { grantType: "invite", resourceType: "frame" },
    { grantType: "publish", resourceType: "frame" },
  ],
  billingAndSecurity: [
    { grantType: "admin", resourceType: "billing" },
    { grantType: "admin", resourceType: "security" },
  ],
} satisfies Record<string, CapabilitySpec[]>;
