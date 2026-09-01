// Type-only import (erased at runtime) so the registry can name the resource shape `fromGrants`
// consumes without a runtime cycle — `group_permission_resource` value-imports this module.
import type { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import type {
  ConcreteResourceType,
  GrantType,
  GrantVerb,
  GroupPermissionResourceType,
  WorkspacePermissions,
} from "@app/types/group_permissions";
import {
  emptyWorkspacePermissions,
  GRANT_VERBS,
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
 * Type-level roles are singletons — one verb — because the Governance page toggles capabilities one
 * verb at a time; a multi-verb type-level role would make a single toggle revoke verbs it did not
 * touch.
 *
 * Naming follows what the role is for. A role named after its verb (`create`, `publish`, `invite`,
 * `use`, `make_discoverable`, `use_workspace_pool`) is a governance capability: an action that is
 * inherently workspace-wide, stays type-level, and is never granted per instance — which is why the
 * name and the verb can be the same word. A role named for what its holder is (`reader`, `member`,
 * `editor`, `admin`) describes access to a resource; it may be granted type-wide today and per
 * instance later, so it keeps a role name even when its only level is `type`.
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
    editor: { verbs: ["read", "write", "admin"], levels: ["instance"] },
    create: { verbs: ["create"], levels: ["type"] },
    publish: { verbs: ["publish"], levels: ["type"] },
  },
  skill: {
    // Type-level for now — the workspace global group holds it on `skill:-1`, which is what makes
    // every skill readable — but named as a role rather than after its verb: unlike a governance
    // capability, readership is expected to become per-skill.
    reader: { verbs: ["read"], levels: ["type"] },
    editor: { verbs: ["read", "write", "admin"], levels: ["instance"] },
    create: { verbs: ["create"], levels: ["type"] },
    publish: { verbs: ["publish"], levels: ["type"] },
    make_discoverable: { verbs: ["make_discoverable"], levels: ["type"] },
  },
  frame: {
    invite: { verbs: ["invite"], levels: ["type"] },
    publish: { verbs: ["publish"], levels: ["type"] },
  },
  billing: {
    admin: { verbs: ["admin"], levels: ["type"] },
  },
  security: {
    admin: { verbs: ["admin"], levels: ["type"] },
  },
  models_tier: {
    use: { verbs: ["use"], levels: ["instance"] },
  },
  dust_app: {
    admin: { verbs: ["admin"], levels: ["type"] },
  },
  trigger: {
    use_workspace_pool: { verbs: ["use_workspace_pool"], levels: ["type"] },
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

// Verbs a grant type confers at any of `levels`; empty when the role is not valid at those levels,
// or the resource type is unknown (e.g. a stale grant row for a removed type).
export function verbsForGrantAtLevels(
  grantType: ConcreteGrantType,
  resourceType: ConcreteResourceType,
  levels: ReadonlySet<GrantLevel>
): GrantVerb[] {
  const role = ROLE_REGISTRY[resourceType]?.[grantType];
  if (!role || !role.levels.some((level) => levels.has(level))) {
    return [];
  }
  return [...role.verbs];
}

// Every verb valid at any of `levels` on `resourceType` — used to expand a "*" grant.
function allVerbsForResourceAtLevels(
  resourceType: ConcreteResourceType,
  levels: ReadonlySet<GrantLevel>
): GrantVerb[] {
  const verbs = new Set<GrantVerb>();
  for (const role of Object.values(ROLE_REGISTRY[resourceType] ?? {})) {
    if (role.levels.some((level) => levels.has(level))) {
      for (const verb of role.verbs) {
        verbs.add(verb);
      }
    }
  }
  return [...verbs];
}

// Every type-level verb on every resource type — an admin's implicit full access.
export function allWorkspacePermissions(): WorkspacePermissions {
  const permissions = emptyWorkspacePermissions();
  for (const resourceType of GROUP_PERMISSION_RESOURCE_TYPES) {
    if (isConcreteResourceType(resourceType)) {
      permissions[resourceType] = allVerbsForResourceAtLevels(
        resourceType,
        new Set<GrantLevel>(["type"])
      );
    }
  }
  return permissions;
}

// The held verb set for a (resourceType, resourceId) is stored as a bitmask integer rather than a
// `Set<GrantVerb>`, to keep the per-request footprint small — one primitive per entry instead of a
// heap Set. There are <10 verbs, so a single bit each fits comfortably in an int.
const VERB_BIT = new Map<GrantVerb, number>(
  GRANT_VERBS.map((verb, index): [GrantVerb, number] => [verb, 1 << index])
);

function verbsToMask(verbs: GrantVerb[]): number {
  let mask = 0;
  for (const verb of verbs) {
    mask |= VERB_BIT.get(verb) ?? 0;
  }
  return mask;
}

function maskToVerbs(mask: number): GrantVerb[] {
  return GRANT_VERBS.filter((verb) => (mask & (VERB_BIT.get(verb) ?? 0)) !== 0);
}

// The grant fields `fromGrants` reads. `GroupPermissionResource` satisfies this structurally, so
// callers pass resources directly (no DTO conversion); typed as a Pick to avoid coupling to the
// full resource and to keep the reference type-only.
type GrantRow = Pick<
  GroupPermissionResource,
  "grantType" | "resourceType" | "resourceId"
>;

// JSON-serializable form of GroupPermissions, embedded in a serialized Authenticator so it can be
// restored without re-querying `group_permissions`. resourceType -> resourceId -> verb bitmask
// (numeric keys become strings after a JSON round-trip; `fromJSON` coerces them back).
export interface GroupPermissionsJSON {
  grants: Partial<Record<ConcreteResourceType, Record<number, number>>>;
}

// The shapes `fromJSON` accepts: the current resolved-mask form, plus the legacy per-group form
// (resourceId -> groupId -> mask) still carried by in-flight Temporal payloads serialized before
// group ids were folded away. TODO(governance): drop the legacy arm once such payloads have drained.
interface SerializedGroupPermissions {
  grants: Partial<
    Record<
      ConcreteResourceType,
      Record<number, number | Record<number, number>>
    >
  >;
}

// What the caller may act on for a given verb: a concrete instance list, or every instance of the
// type when a type-wide (-1) grant confers it. Callers must handle "all" — that is the point of the
// union (see `GroupPermissions.resourceIdsWithVerb`).
export type ResourcesWithVerb =
  | { kind: "all" }
  | { kind: "ids"; resourceIds: number[] };

/**
 * The governance grants the *caller* holds, resolved once at auth construction. Keyed by
 * (resourceType, resourceId) -> verb bitmask: resourceId is WHOLE_TYPE_RESOURCE_ID (-1) for type-
 * wide capabilities (e.g. "create" on "agent") or a resource's model id for instance grants. A
 * type-wide grant satisfies an instance check on any id of that type.
 *
 * The caller's groups are folded away at construction: we only load the caller's groups, so the
 * mask on each (resourceType, resourceId) is the union of the verbs every one of the caller's
 * groups confers there. This is why the structure is caller-scoped and holds no group ids — it
 * answers "what may the caller do on this resource", not "which group grants it". Holds only grants;
 * admin-by-default access is layered on by the Authenticator.
 *
 * Example — the grant rows of a caller belonging to groups 7 and 9:
 *
 *   | groupId | grantType | resourceType | resourceId |
 *   | ------- | --------- | ------------ | ---------- |
 *   | 7       | member    | space        | 12         |
 *   | 9       | reader    | space        | 12         |
 *   | 7       | create    | skill        | -1         |
 *
 * become (with read=1, write=2, admin=4, create=8):
 *
 *   {
 *     space: { 12: 0b0011 },
 *     skill: { -1: 0b1000 },
 *   }
 *
 * `member` expands to read + write and `reader` to read, so on space 12 the caller's two groups
 * union to mask 3. The skill row is type-wide (-1), so it answers a "create" check on any skill.
 */
export class GroupPermissions {
  private constructor(
    // resourceType -> resourceId -> verb bitmask (see VERB_BIT), unioned across the caller's groups.
    // resourceId WHOLE_TYPE_RESOURCE_ID (-1) is the type-wide entry.
    private readonly grants: Map<ConcreteResourceType, Map<number, number>>
  ) {}

  static empty(): GroupPermissions {
    return new GroupPermissions(new Map());
  }

  static fromGrants(grants: readonly GrantRow[]): GroupPermissions {
    const map = new Map<ConcreteResourceType, Map<number, number>>();
    const add = (
      resourceType: ConcreteResourceType,
      resourceId: number,
      mask: number
    ) => {
      if (mask === 0) {
        return;
      }
      let byId = map.get(resourceType);
      if (!byId) {
        byId = new Map();
        map.set(resourceType, byId);
      }
      byId.set(resourceId, (byId.get(resourceId) ?? 0) | mask);
    };

    for (const { grantType, resourceType, resourceId } of grants) {
      // A whole-type grant applies both to the type itself and to all its instances.
      const levels = new Set<GrantLevel>(
        resourceId === WHOLE_TYPE_RESOURCE_ID
          ? ["type", "instance"]
          : ["instance"]
      );
      const resourceTypes =
        resourceType === "*"
          ? GROUP_PERMISSION_RESOURCE_TYPES.filter(isConcreteResourceType)
          : [resourceType];

      for (const rt of resourceTypes) {
        // Skip stale grant rows for resource types no longer in the registry.
        if (!isConcreteResourceType(rt) || !ROLE_REGISTRY[rt]) {
          continue;
        }
        const verbs =
          grantType === "*"
            ? allVerbsForResourceAtLevels(rt, levels)
            : verbsForGrantAtLevels(grantType, rt, levels);
        add(rt, resourceId, verbsToMask(verbs));
      }
    }

    return new GroupPermissions(map);
  }

  // Rebuilds from the serialized form (see toJSON) — no DB access. Reads both the current shape and
  // the legacy per-group shape (see SerializedGroupPermissions).
  static fromJSON(json: SerializedGroupPermissions): GroupPermissions {
    const map = new Map<ConcreteResourceType, Map<number, number>>();
    for (const resourceType of GROUP_PERMISSION_RESOURCE_TYPES) {
      if (!isConcreteResourceType(resourceType)) {
        continue;
      }
      const byIdRecord = json.grants[resourceType];
      if (!byIdRecord) {
        continue;
      }
      const byId = new Map<number, number>();
      for (const [resourceId, value] of Object.entries(byIdRecord)) {
        // `value` is the resolved mask in the current shape; tolerate the legacy per-group shape
        // by OR-ing the group masks together.
        const mask =
          typeof value === "number"
            ? value
            : Object.values(value).reduce((acc, m) => acc | m, 0);
        byId.set(Number(resourceId), mask);
      }
      map.set(resourceType, byId);
    }
    return new GroupPermissions(map);
  }

  // The verbs the caller holds on (resourceType, resourceId), folding in the type-wide (-1) grants
  // so a workspace-wide grant satisfies an instance lookup. Already the union across the caller's
  // groups (see the class doc), so it is caller-scoped and needs no membership step. Governance-
  // sourced ACLs carry this as `grantedVerbs`.
  resolvedVerbsForResource(
    resourceType: ConcreteResourceType,
    resourceId: number
  ): GrantVerb[] {
    const byId = this.grants.get(resourceType);
    if (!byId) {
      return [];
    }
    let mask = 0;
    for (const key of new Set([resourceId, WHOLE_TYPE_RESOURCE_ID])) {
      mask |= byId.get(key) ?? 0;
    }
    return maskToVerbs(mask);
  }

  // The instances of `resourceType` on which the caller holds `verb` — the reverse of
  // resolvedVerbsForResource, for callers that enumerate what they may act on ("which spaces am I a
  // member of") rather than checking one id.
  //
  // A type-wide (-1) grant confers the verb on every instance and names none, so it cannot be
  // returned as a list. It is reported as "all" rather than folded away: `resolvedVerbsForResource`
  // does fold -1 in, so dropping it here would answer yes for a single id and no for the
  // enumeration of the same verb.
  resourceIdsWithVerb(
    resourceType: ConcreteResourceType,
    verb: GrantVerb
  ): ResourcesWithVerb {
    const bit = VERB_BIT.get(verb) ?? 0;
    const byId = this.grants.get(resourceType);
    if (!byId || bit === 0) {
      return { kind: "ids", resourceIds: [] };
    }

    if (((byId.get(WHOLE_TYPE_RESOURCE_ID) ?? 0) & bit) !== 0) {
      return { kind: "all" };
    }

    const resourceIds: number[] = [];
    for (const [resourceId, mask] of byId) {
      if (resourceId === WHOLE_TYPE_RESOURCE_ID) {
        continue;
      }
      if ((mask & bit) !== 0) {
        resourceIds.push(resourceId);
      }
    }
    return { kind: "ids", resourceIds };
  }

  // The type-wide (-1) verbs the caller's grants confer per resource type — the flat record for the
  // auth context / Workspace & Governance page. Grants only; admin-by-default is layered on by the
  // Authenticator (see `getWorkspacePermissions`).
  toWorkspacePermissions(): WorkspacePermissions {
    const result = emptyWorkspacePermissions();
    for (const [resourceType, byId] of this.grants) {
      const mask = byId.get(WHOLE_TYPE_RESOURCE_ID) ?? 0;
      if (mask) {
        result[resourceType] = maskToVerbs(mask);
      }
    }
    return result;
  }

  // Serializes the resolved grant map for embedding in a serialized Authenticator, so `fromJSON`
  // can restore it without hitting the DB. Round-trips exactly.
  toJSON(): GroupPermissionsJSON {
    const grants: Partial<
      Record<ConcreteResourceType, Record<number, number>>
    > = {};
    for (const [resourceType, byId] of this.grants) {
      const byIdRecord: Record<number, number> = {};
      for (const [resourceId, mask] of byId) {
        byIdRecord[resourceId] = mask;
      }
      grants[resourceType] = byIdRecord;
    }
    return { grants };
  }

  // Human-readable dump for debugging: decodes bitmasks to verbs. resourceId -1 renders as "*"
  // (type-wide). Not for production paths — inspection only.
  toString(): string {
    const parts: string[] = [];
    for (const [resourceType, byId] of this.grants) {
      const entries = [...byId.entries()].map(([resourceId, mask]) => {
        const id = resourceId === WHOLE_TYPE_RESOURCE_ID ? "*" : resourceId;
        return `${id}: [${maskToVerbs(mask).join(", ")}]`;
      });
      parts.push(`${resourceType}: { ${entries.join(", ")} }`);
    }
    return `GroupPermissions { ${parts.join("; ")} }`;
  }
}
