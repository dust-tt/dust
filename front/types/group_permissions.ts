/**
 * Vocabulary for the `group_permissions` table (Admin Governance §1A).
 *
 * All permission grants — resource-level access (spaces, agents, skills) and workspace-level
 * capabilities (billing, identity, …) — live in a single table keyed by a plain-verb
 * `permissionType`, a `resourceType`, and a numeric `resourceId`. The validity of a given
 * (permissionType, resourceType, resourceId) combination is enforced by the registry in
 * `@app/lib/resources/group_permission_registry`; this file only defines the raw vocabulary and
 * the "whole type" sentinel.
 */

// Plain verbs. "*" means "all verbs".
export const PERMISSION_TYPES = [
  "read",
  "write",
  "admin",
  "create",
  "publish",
  "invite",
  "*",
] as const;
export type PermissionType = (typeof PERMISSION_TYPES)[number];

// Resource domains. "*" means "all resource types".
export const GROUP_PERMISSION_RESOURCE_TYPES = [
  "space",
  "agent",
  "skill",
  "frame",
  "billing",
  "identity",
  "audit_log",
  "*",
] as const;
export type GroupPermissionResourceType =
  (typeof GROUP_PERMISSION_RESOURCE_TYPES)[number];

// `resourceId = -1` means "the type as a whole": for instance-level verbs, all resources of the
// type; for type-level verbs (e.g. "create"), the only sensible value. There is deliberately no
// NULL anywhere — one meaning, one representation — and the unique index dedupes wildcard rows.
export const WHOLE_TYPE_RESOURCE_ID = -1;

export function isPermissionType(value: unknown): value is PermissionType {
  return PERMISSION_TYPES.includes(value as PermissionType);
}

export function isGroupPermissionResourceType(
  value: unknown
): value is GroupPermissionResourceType {
  return GROUP_PERMISSION_RESOURCE_TYPES.includes(
    value as GroupPermissionResourceType
  );
}
