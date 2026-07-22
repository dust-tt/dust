import type {
  ConcreteResourceType,
  GrantType,
  GrantVerb,
  GroupPermissionResourceType,
  WorkspacePermissions,
} from "@app/types/group_permissions";
import {
  GROUP_PERMISSION_RESOURCE_TYPES,
  isConcreteResourceType,
  WHOLE_TYPE_RESOURCE_ID,
} from "@app/types/group_permissions";
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

export type ConcreteGrantType = Exclude<GrantType, "*">;

// A grant applies either to a specific resource instance (resourceId > 0) or to the whole type
// (resourceId = -1). A role declares the levels at which it can be granted.
export type GrantLevel = "instance" | "type";

interface RoleDefinition {
  verbs: GrantVerb[];
  levels: GrantLevel[];
}

export const ROLE_REGISTRY: Record<
  ConcreteResourceType,
  Partial<Record<ConcreteGrantType, RoleDefinition>>
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

// Roles for `resourceType` whose verbs include `verb` at the given level — the verb→role expansion
// `hasWorkspacePermission` needs to turn a capability question into stored grant types.
export function grantTypesForVerb(
  resourceType: ConcreteResourceType,
  verb: GrantVerb,
  level: GrantLevel
): ConcreteGrantType[] {
  const roles = ROLE_REGISTRY[resourceType];
  // Object.keys() widens back to `string[]`; the cast is safe because ROLE_REGISTRY's declared
  // type guarantees these keys are exactly ConcreteGrantType.
  return (Object.keys(roles) as ConcreteGrantType[]).filter((grantType) => {
    const role = roles[grantType];
    return !!role && role.verbs.includes(verb) && role.levels.includes(level);
  });
}

// Verbs a grant type confers at `level`; empty when the role is not valid at that level.
function verbsForGrantAtLevel(
  grantType: ConcreteGrantType,
  resourceType: ConcreteResourceType,
  level: GrantLevel
): GrantVerb[] {
  const role = ROLE_REGISTRY[resourceType][grantType];
  if (!role || !role.levels.includes(level)) {
    return [];
  }
  return role.verbs;
}

// Every verb valid at `level` on `resourceType` — used to expand a "*" grant.
function allVerbsForResourceAtLevel(
  resourceType: ConcreteResourceType,
  level: GrantLevel
): GrantVerb[] {
  const verbs = new Set<GrantVerb>();
  for (const role of Object.values(ROLE_REGISTRY[resourceType])) {
    if (role.levels.includes(level)) {
      for (const verb of role.verbs) {
        verbs.add(verb);
      }
    }
  }
  return [...verbs];
}

function emptyWorkspacePermissions(): WorkspacePermissions {
  return {
    space: [],
    agent: [],
    skill: [],
    frame: [],
    billing: [],
    identity: [],
    audit_log: [],
    models_tier: [],
  };
}

// A raw grant row as stored in `group_permissions`: a role name for a (resourceType, resourceId).
export interface StoredGrant {
  grantType: GrantType;
  resourceType: GroupPermissionResourceType;
  resourceId: number;
}

/**
 * The governance grants a caller holds, resolved once at auth construction. Grants are keyed by
 * (resourceType, resourceId): resourceId is WHOLE_TYPE_RESOURCE_ID (-1) for type-wide capabilities
 * (e.g. "create" on "agent") or a resource's model id for instance grants (e.g. "write" on a
 * specific space). A type-wide grant satisfies an instance check on any id of that type.
 */
export class WorkspacePermissionSet {
  private constructor(
    private readonly grants: Map<
      ConcreteResourceType,
      Map<number, Set<GrantVerb>>
    >,
    // Admins hold every capability on every resource/instance by default.
    private readonly isAdminAll: boolean
  ) {}

  static empty(): WorkspacePermissionSet {
    return new WorkspacePermissionSet(new Map(), false);
  }

  static all(): WorkspacePermissionSet {
    return new WorkspacePermissionSet(new Map(), true);
  }

  static fromGrants(grants: StoredGrant[]): WorkspacePermissionSet {
    const map = new Map<ConcreteResourceType, Map<number, Set<GrantVerb>>>();
    const add = (
      resourceType: ConcreteResourceType,
      resourceId: number,
      verbs: GrantVerb[]
    ) => {
      if (verbs.length === 0) {
        return;
      }
      let byId = map.get(resourceType);
      if (!byId) {
        byId = new Map();
        map.set(resourceType, byId);
      }
      let set = byId.get(resourceId);
      if (!set) {
        set = new Set();
        byId.set(resourceId, set);
      }
      for (const verb of verbs) {
        set.add(verb);
      }
    };

    for (const { grantType, resourceType, resourceId } of grants) {
      // A "*" grant / -1 resourceId are always type-wide; concrete ids are instance-level.
      const level: GrantLevel =
        resourceId === WHOLE_TYPE_RESOURCE_ID ? "type" : "instance";
      const resourceTypes =
        resourceType === "*"
          ? GROUP_PERMISSION_RESOURCE_TYPES.filter(isConcreteResourceType)
          : [resourceType];

      for (const rt of resourceTypes) {
        const verbs =
          grantType === "*"
            ? allVerbsForResourceAtLevel(rt, level)
            : verbsForGrantAtLevel(grantType, rt, level);
        add(rt, resourceId, verbs);
      }
    }

    return new WorkspacePermissionSet(map, false);
  }

  // Whether the caller holds `verb` on the given resource instance. A type-wide (-1) grant on the
  // resource type satisfies the check for any instance.
  has(
    resourceType: ConcreteResourceType,
    resourceId: number,
    verb: GrantVerb
  ): boolean {
    if (this.isAdminAll) {
      return true;
    }
    const byId = this.grants.get(resourceType);
    if (!byId) {
      return false;
    }
    return (
      (byId.get(resourceId)?.has(verb) ?? false) ||
      (byId.get(WHOLE_TYPE_RESOURCE_ID)?.has(verb) ?? false)
    );
  }

  hasTypeWide(resourceType: ConcreteResourceType, verb: GrantVerb): boolean {
    return this.has(resourceType, WHOLE_TYPE_RESOURCE_ID, verb);
  }

  // The type-wide (-1) capabilities the caller holds, as the flat per-resource-type record consumed
  // by the `/permissions` endpoint and the Workspace & Governance page. Admins, who hold everything
  // implicitly, are materialized as every type-level verb on every resource type.
  toTypeWideWorkspacePermissions(): WorkspacePermissions {
    const result = emptyWorkspacePermissions();

    if (this.isAdminAll) {
      for (const resourceType of GROUP_PERMISSION_RESOURCE_TYPES) {
        if (isConcreteResourceType(resourceType)) {
          result[resourceType] = allVerbsForResourceAtLevel(
            resourceType,
            "type"
          );
        }
      }
      return result;
    }

    for (const [resourceType, byId] of this.grants) {
      const typeWideVerbs = byId.get(WHOLE_TYPE_RESOURCE_ID);
      if (typeWideVerbs) {
        result[resourceType] = [...typeWideVerbs];
      }
    }
    return result;
  }
}
