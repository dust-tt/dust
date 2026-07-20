import type {
  GrantType,
  GrantVerb,
  GroupPermissionResourceType,
} from "@app/types/group_permissions";
import { WHOLE_TYPE_RESOURCE_ID } from "@app/types/group_permissions";
import assert from "assert";

/**
 * Static source of truth for `group_permissions` validity, expressed as roles.
 *
 * A role is a named bundle of verbs, valid at one or more levels. Instance-level roles bundle the
 * verbs the product grants and revokes as a unit (e.g. a space `member` is `read` + `write`).
 * Type-level capability roles are singletons — their name equals their single verb — because the
 * Governance page toggles capabilities one verb at a time; a multi-verb type-level role would make
 * a single toggle revoke verbs it did not touch.
 *
 * A grant row stores the role name (see `@app/types/group_permissions`); `assertValidGrant` checks
 * a grant type is a role defined for its resource type at the required level. Translating a
 * capability question (a verb) into the roles that grant it — verb→role expansion — is deferred
 * until an instance-level, multi-verb capability check needs it.
 *
 * The `"*"` wildcards in the vocabulary are intentionally not part of this registry: a wildcard
 * grant applies to the whole type (or all types) and is only ever a type-level (`-1`) grant.
 */

// Concrete (non-wildcard) vocabulary — the registry describes these.
type ConcreteResourceType = Exclude<GroupPermissionResourceType, "*">;

// A grant applies either to a specific resource instance (resourceId > 0) or to the whole type
// (resourceId = -1). A role declares the levels at which it can be granted.
type GrantLevel = "instance" | "type";

interface RoleDefinition {
  verbs: GrantVerb[];
  levels: GrantLevel[];
}

export const ROLE_REGISTRY: Record<
  ConcreteResourceType,
  Record<string, RoleDefinition>
> = {
  space: {
    reader: { verbs: ["read"], levels: ["instance"] },
    member: { verbs: ["read", "write"], levels: ["instance"] },
    admin: { verbs: ["read", "write", "admin"], levels: ["instance"] },
  },
  agent: {
    editor: { verbs: ["read", "write"], levels: ["instance"] },
    create: { verbs: ["create"], levels: ["type"] },
    publish: { verbs: ["publish"], levels: ["type"] },
  },
  skill: {
    editor: { verbs: ["read", "write"], levels: ["instance"] },
    create: { verbs: ["create"], levels: ["type"] },
    publish: { verbs: ["publish"], levels: ["type"] },
  },
  frame: {
    invite: { verbs: ["invite"], levels: ["type"] },
    publish: { verbs: ["publish"], levels: ["type"] },
  },
  billing: {
    admin: { verbs: ["admin"], levels: ["type"] },
  },
  identity: {
    admin: { verbs: ["admin"], levels: ["type"] },
  },
  audit_log: {
    read: { verbs: ["read"], levels: ["type"] },
  },
  models_tier: {
    use: { verbs: ["use"], levels: ["instance"] },
  },
};

interface GrantSpec {
  grantType: GrantType;
  resourceType: GroupPermissionResourceType;
  resourceId: number;
}

// Throws when the (grantType, resourceType, resourceId) combination is not representable in the
// governance model. Fail-fast: callers pass programmatic values, not user input.
export function assertValidGrant({
  grantType,
  resourceType,
  resourceId,
}: GrantSpec): void {
  // A wildcard on either axis applies to the whole type / all types and is always type-level.
  if (grantType === "*" || resourceType === "*") {
    assert(
      resourceId === WHOLE_TYPE_RESOURCE_ID,
      `Wildcard grant (${grantType} on ${resourceType}) requires resourceId = ${WHOLE_TYPE_RESOURCE_ID}.`
    );
    return;
  }

  const role = ROLE_REGISTRY[resourceType][grantType];
  assert(
    role,
    `Grant type "${grantType}" is not allowed on resource type "${resourceType}".`
  );

  // Type-wide grant (all resources of the type / an instance-less domain).
  if (resourceId === WHOLE_TYPE_RESOURCE_ID) {
    assert(
      role.levels.includes("type"),
      `Grant type "${grantType}" cannot be granted type-wide on "${resourceType}".`
    );
    return;
  }

  // Instance-level grant: a real resource id.
  assert(
    resourceId > 0,
    `Instance-level grant on "${resourceType}" requires a positive resourceId or ${WHOLE_TYPE_RESOURCE_ID}, got ${resourceId}.`
  );
  assert(
    role.levels.includes("instance"),
    `Grant type "${grantType}" on "${resourceType}" is type-level and requires resourceId = ${WHOLE_TYPE_RESOURCE_ID}.`
  );
}
