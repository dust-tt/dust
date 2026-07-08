import type {
  GroupPermissionResourceType,
  PermissionType,
} from "@app/types/group_permissions";
import { WHOLE_TYPE_RESOURCE_ID } from "@app/types/group_permissions";
import assert from "assert";

/**
 * Static source of truth for `group_permissions` validity.
 *
 * The table is polymorphic, so its representable space is larger than its valid space. Every write
 * path in `GroupPermissionResource` validates against this registry and throws on violation — invalid
 * writes are programmer errors, so we fail fast rather than returning a `Result`. The DB CHECK only
 * covers the coarse instance-less-domain rule; finer per-verb rules (e.g. `create` ⇒ `-1` only) live
 * here.
 *
 * The `"*"` wildcards in the vocabulary are intentionally not part of the per-type table: a wildcard
 * grant applies to the whole type (or all types) and is only ever a type-level (`-1`) grant.
 */

// Concrete (non-wildcard) vocabulary — the registry describes these.
type ConcreteResourceType = Exclude<GroupPermissionResourceType, "*">;
type ConcretePermissionType = Exclude<PermissionType, "*">;

interface ResourceTypeRule {
  // Verbs grantable on a specific instance (resourceId > 0).
  instanceLevelPermissions: ConcretePermissionType[];
  // Verbs grantable type-wide (resourceId = -1). For types with instances this includes the
  // instance verbs (a -1 grant covers all resources) plus type-only verbs like "create"; the two
  // lists therefore overlap. Instance-less domains have an empty instanceLevelPermissions and list
  // their verbs here only.
  typeLevelPermissions: ConcretePermissionType[];
}

const REGISTRY: Record<ConcreteResourceType, ResourceTypeRule> = {
  space: {
    instanceLevelPermissions: ["read", "write", "admin"],
    typeLevelPermissions: ["read", "write", "admin"],
  },
  agent: {
    instanceLevelPermissions: ["read", "write", "publish"],
    typeLevelPermissions: ["read", "write", "publish", "create"],
  },
  skill: {
    instanceLevelPermissions: ["read", "write", "publish"],
    typeLevelPermissions: ["read", "write", "publish", "create"],
  },
  frame: {
    instanceLevelPermissions: [],
    typeLevelPermissions: ["invite", "publish"],
  },
  billing: {
    instanceLevelPermissions: [],
    typeLevelPermissions: ["admin"],
  },
  identity: {
    instanceLevelPermissions: [],
    typeLevelPermissions: ["admin"],
  },
  audit_log: {
    instanceLevelPermissions: [],
    typeLevelPermissions: ["read"],
  },
};

interface GrantSpec {
  permissionType: PermissionType;
  resourceType: GroupPermissionResourceType;
  resourceId: number;
}

// Throws when the (permissionType, resourceType, resourceId) combination is not representable in the
// governance model. Fail-fast: callers pass programmatic values, not user input.
export function assertValidGrant({
  permissionType,
  resourceType,
  resourceId,
}: GrantSpec): void {
  // A wildcard on either axis applies to the whole type / all types and is always type-level.
  if (permissionType === "*" || resourceType === "*") {
    assert(
      resourceId === WHOLE_TYPE_RESOURCE_ID,
      `Wildcard grant (${permissionType} on ${resourceType}) requires resourceId = ${WHOLE_TYPE_RESOURCE_ID}.`
    );
    return;
  }

  const rule = REGISTRY[resourceType];
  const allowedOnInstance =
    rule.instanceLevelPermissions.includes(permissionType);
  const allowedTypeWide = rule.typeLevelPermissions.includes(permissionType);
  assert(
    allowedOnInstance || allowedTypeWide,
    `Permission "${permissionType}" is not allowed on resource type "${resourceType}".`
  );

  // Type-wide grant (all resources of the type / an instance-less domain).
  if (resourceId === WHOLE_TYPE_RESOURCE_ID) {
    assert(
      allowedTypeWide,
      `Permission "${permissionType}" cannot be granted type-wide on "${resourceType}".`
    );
    return;
  }

  // Instance-level grant: a real resource id.
  assert(
    resourceId > 0,
    `Instance-level grant on "${resourceType}" requires a positive resourceId or ${WHOLE_TYPE_RESOURCE_ID}, got ${resourceId}.`
  );
  assert(
    allowedOnInstance,
    `Permission "${permissionType}" on "${resourceType}" is type-level and requires resourceId = ${WHOLE_TYPE_RESOURCE_ID}.`
  );
}
