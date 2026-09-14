import type { GrantLevel } from "@app/lib/resources/group_permission_registry";
import {
  assertValidGrant,
  GroupPermissions,
  grantTypesForVerb,
  ROLE_REGISTRY,
  verbsForGrantAtLevels,
} from "@app/lib/resources/group_permission_registry";
import type { GrantVerb } from "@app/types/group_permissions";
import {
  GRANT_TYPES,
  GRANT_VERBS,
  WHOLE_TYPE_RESOURCE_ID,
} from "@app/types/group_permissions";
import { describe, expect, it } from "vitest";

describe("assertValidGrant", () => {
  describe("accepts valid combinations", () => {
    it("instance-level role (reader) with a real resourceId", () => {
      expect(() =>
        assertValidGrant({
          grantType: "reader",
          resourceType: "space",
          resourceId: 5,
        })
      ).not.toThrow();
    });

    it("instance-level role (editor) on an agent", () => {
      expect(() =>
        assertValidGrant({
          grantType: "editor",
          resourceType: "agent",
          resourceId: 7,
        })
      ).not.toThrow();
    });

    it("type-level capability (publish) with -1", () => {
      expect(() =>
        assertValidGrant({
          grantType: "publish",
          resourceType: "agent",
          resourceId: WHOLE_TYPE_RESOURCE_ID,
        })
      ).not.toThrow();
    });

    it("type-level capability (create) with -1", () => {
      expect(() =>
        assertValidGrant({
          grantType: "create",
          resourceType: "skill",
          resourceId: WHOLE_TYPE_RESOURCE_ID,
        })
      ).not.toThrow();
    });

    it("instance-less domain with -1", () => {
      expect(() =>
        assertValidGrant({
          grantType: "admin",
          resourceType: "billing",
          resourceId: WHOLE_TYPE_RESOURCE_ID,
        })
      ).not.toThrow();
    });

    it("models tier use with a tier id", () => {
      expect(() =>
        assertValidGrant({
          grantType: "use",
          resourceType: "models_tier",
          resourceId: 2,
        })
      ).not.toThrow();
    });

    it("full wildcard with -1", () => {
      expect(() =>
        assertValidGrant({
          grantType: "*",
          resourceType: "*",
          resourceId: WHOLE_TYPE_RESOURCE_ID,
        })
      ).not.toThrow();
    });
  });

  describe("rejects invalid combinations", () => {
    it("grant type not a role on the resource type", () => {
      expect(() =>
        assertValidGrant({
          grantType: "invite",
          resourceType: "space",
          resourceId: 5,
        })
      ).toThrow(/not allowed/);
    });

    it("real resourceId on an instance-less domain", () => {
      expect(() =>
        assertValidGrant({
          grantType: "admin",
          resourceType: "billing",
          resourceId: 5,
        })
      ).toThrow(/type-level/);
    });

    it("real resourceId on a type-level capability (create)", () => {
      expect(() =>
        assertValidGrant({
          grantType: "create",
          resourceType: "agent",
          resourceId: 5,
        })
      ).toThrow(/type-level/);
    });

    it("wildcard permission with a real resourceId", () => {
      expect(() =>
        assertValidGrant({
          grantType: "*",
          resourceType: "agent",
          resourceId: 5,
        })
      ).toThrow(/Wildcard/);
    });

    it("zero resourceId (neither a real id nor the sentinel)", () => {
      expect(() =>
        assertValidGrant({
          grantType: "reader",
          resourceType: "space",
          resourceId: 0,
        })
      ).toThrow(/positive resourceId/);
    });

    it("type-wide grant on models_tier", () => {
      expect(() =>
        assertValidGrant({
          grantType: "use",
          resourceType: "models_tier",
          resourceId: WHOLE_TYPE_RESOURCE_ID,
        })
      ).toThrow(/cannot be granted type-wide/);
    });

    it("instance-level publish on an agent (publish is type-level)", () => {
      expect(() =>
        assertValidGrant({
          grantType: "publish",
          resourceType: "agent",
          resourceId: 5,
        })
      ).toThrow(/type-level/);
    });

    it("type-wide editor on an agent (editor is instance-only)", () => {
      expect(() =>
        assertValidGrant({
          grantType: "editor",
          resourceType: "agent",
          resourceId: WHOLE_TYPE_RESOURCE_ID,
        })
      ).toThrow(/cannot be granted type-wide/);
    });

    it("type-wide grant on a space (space roles are instance-only)", () => {
      expect(() =>
        assertValidGrant({
          grantType: "reader",
          resourceType: "space",
          resourceId: WHOLE_TYPE_RESOURCE_ID,
        })
      ).toThrow(/cannot be granted type-wide/);
    });
  });
});

describe("ROLE_REGISTRY invariants", () => {
  const roleMaps = Object.values(ROLE_REGISTRY);

  it("has no two roles with an identical verb set within a resource type", () => {
    for (const roles of roleMaps) {
      const verbSets = Object.values(roles).map((role) =>
        [...role.verbs].sort().join(",")
      );
      expect(new Set(verbSets).size).toBe(verbSets.length);
    }
  });

  it("makes every grant verb reachable via at least one role", () => {
    const reachable = new Set<string>();
    for (const roles of roleMaps) {
      for (const role of Object.values(roles)) {
        for (const verb of role.verbs) {
          reachable.add(verb);
        }
      }
    }
    for (const verb of GRANT_VERBS) {
      expect(reachable.has(verb)).toBe(true);
    }
  });

  it("lets the skill editor role administrate its skill", () => {
    // A skill's editor group is also its administrator (archive / restore / manage editors, all
    // gated by SkillResource.canAdministrate), so `editor` must confer `admin` at instance level —
    // otherwise editors lose those actions once group_permissions becomes the read source.
    expect(grantTypesForVerb("skill", "admin", "instance")).toContain("editor");
  });

  it("lets the agent editor role administrate its agent", () => {
    // Agent editors can archive / restore agents and manage their editors. Keep those actions when
    // group_permissions becomes the read source by granting `admin` through the editor role.
    expect(grantTypesForVerb("agent", "admin", "instance")).toContain("editor");
  });

  it("keeps every type-level role a singleton", () => {
    // The Governance page toggles capabilities one verb at a time, so a type-level role must carry
    // exactly one verb. The name is not required to be that verb: a governance capability is named
    // after its verb because it stays type-level forever, while a role that describes access to a
    // resource (skill `reader`) keeps its role name so it can also be granted per instance later.
    for (const roles of roleMaps) {
      for (const role of Object.values(roles)) {
        if (role.levels.includes("type")) {
          expect(role.verbs).toHaveLength(1);
        }
      }
    }
  });

  it("keeps the flat GRANT_TYPES vocabulary in sync with the role names", () => {
    const roleNames = new Set<string>();
    for (const roles of roleMaps) {
      for (const name of Object.keys(roles)) {
        roleNames.add(name);
      }
    }
    // Every role name is a declared grant type, and every grant type ("*" aside) is a real role.
    for (const name of roleNames) {
      expect(GRANT_TYPES).toContain(name);
    }
    for (const grantType of GRANT_TYPES) {
      if (grantType !== "*") {
        expect(roleNames.has(grantType)).toBe(true);
      }
    }
  });
});

describe("verbsForGrantAtLevels", () => {
  it("matches a role against any supplied level", () => {
    const levels = new Set<GrantLevel>(["instance", "type"]);

    expect(verbsForGrantAtLevels("create", "agent", levels)).toEqual([
      "create",
    ]);
    expect(verbsForGrantAtLevels("editor", "agent", levels)).toEqual([
      "read",
      "write",
      "admin",
    ]);
  });
});

describe("GroupPermissions.fromJSON", () => {
  // read = 1 << 0, write = 1 << 1 (see VERB_BIT / GRANT_VERBS order).
  it("reads the current resolved-mask shape", () => {
    const perms = GroupPermissions.fromJSON({
      grants: { agent: { 42: 0b11 } },
    });
    expect(perms.resolvedVerbsForResource("agent", 42)).toEqual([
      "read",
      "write",
    ]);
  });

  it("reads the legacy per-group shape by OR-ing the group masks", () => {
    // In-flight Temporal payloads serialized before group ids were folded away carry
    // resourceId -> groupId -> mask; groups 7 and 9 union to read + write.
    const perms = GroupPermissions.fromJSON({
      grants: { agent: { 42: { 7: 0b01, 9: 0b10 } } },
    });
    expect(perms.resolvedVerbsForResource("agent", 42)).toEqual([
      "read",
      "write",
    ]);
  });

  it("round-trips the current shape through toJSON", () => {
    const json = { grants: { agent: { 42: 0b11 } } };
    expect(GroupPermissions.fromJSON(json).toJSON()).toEqual(json);
  });
});

describe("GroupPermissions wildcard grant", () => {
  const WILDCARD = [
    {
      grantType: "*",
      resourceType: "*",
      resourceId: WHOLE_TYPE_RESOURCE_ID,
    },
  ] as const;

  it("confers every verb the registry defines, at every level", () => {
    const perms = GroupPermissions.fromGrants([...WILDCARD]);

    // Instance-level roles: `space` declares no type-level role at all, so a wildcard would confer
    // nothing there if it only expanded type-level verbs.
    expect(perms.resolvedVerbsForResource("space", 12).sort()).toEqual([
      "admin",
      "read",
      "write",
    ]);
    // Type-level capabilities alongside the instance ones.
    expect(perms.resolvedVerbsForResource("agent", 42).sort()).toEqual([
      "admin",
      "create",
      "publish",
      "read",
      "write",
    ]);
    expect(perms.resolvedVerbsForResource("billing", 1)).toEqual(["admin"]);
  });

  it("confers them on instances it has never seen", () => {
    const perms = GroupPermissions.fromGrants([...WILDCARD]);
    expect(perms.resolvedVerbsForResource("space", 999999)).toContain("write");
  });

  it("confers only the instance-level roles on a concrete id", () => {
    // `assertValidGrant` pins a wildcard to WHOLE_TYPE_RESOURCE_ID, so this row is not one the
    // product writes; a stale one must not confer the type-level capabilities on that instance.
    const perms = GroupPermissions.fromGrants([
      { grantType: "*", resourceType: "agent", resourceId: 42 },
    ]);
    expect(perms.resolvedVerbsForResource("agent", 42).sort()).toEqual([
      "admin",
      "read",
      "write",
    ]);
  });

  it("round-trips through toJSON / fromJSON", () => {
    const perms = GroupPermissions.fromGrants([...WILDCARD]);
    const restored = GroupPermissions.fromJSON(perms.toJSON());
    expect(restored.toJSON()).toEqual(perms.toJSON());
    expect(restored.resolvedVerbsForResource("space", 12)).toContain("admin");
  });

  it("enumerates as every instance, not as none", () => {
    // A type-wide entry names no id, so it cannot come back as a list. Reporting "all" is what
    // keeps the enumeration consistent with `resolvedVerbsForResource`, which folds -1 in.
    expect(
      GroupPermissions.fromGrants([...WILDCARD]).resourceIdsWithVerb(
        "space",
        "read"
      )
    ).toEqual({ kind: "all" });
  });
});

describe("GroupPermissions.resourceIdsWithVerb", () => {
  // read = 1 << 0, write = 1 << 1, admin = 1 << 2 (see VERB_BIT / GRANT_VERBS order).
  it("returns the instance ids holding the verb", () => {
    const perms = GroupPermissions.fromJSON({
      grants: { space: { 12: 0b011, 34: 0b001 } },
    });
    expect(perms.resourceIdsWithVerb("space", "read")).toEqual({
      kind: "ids",
      resourceIds: [12, 34],
    });
    expect(perms.resourceIdsWithVerb("space", "write")).toEqual({
      kind: "ids",
      resourceIds: [12],
    });
  });

  it("filters out ids that lack the verb", () => {
    const perms = GroupPermissions.fromJSON({
      grants: { space: { 12: 0b001, 34: 0b011 } },
    });
    expect(perms.resourceIdsWithVerb("space", "write")).toEqual({
      kind: "ids",
      resourceIds: [34],
    });
    expect(perms.resourceIdsWithVerb("space", "admin")).toEqual({
      kind: "ids",
      resourceIds: [],
    });
  });

  it("reports the type-wide (-1) entry as every instance", () => {
    const perms = GroupPermissions.fromJSON({
      grants: { agent: { [WHOLE_TYPE_RESOURCE_ID]: 0b1000, 42: 0b011 } },
    });
    // `read` is held on 42 only; `create` comes from the type-wide entry, so it covers every agent.
    expect(perms.resourceIdsWithVerb("agent", "read")).toEqual({
      kind: "ids",
      resourceIds: [42],
    });
    expect(perms.resourceIdsWithVerb("agent", "create")).toEqual({
      kind: "all",
    });
  });

  it("returns an empty list when the resource type has no grants", () => {
    const perms = GroupPermissions.fromJSON({ grants: {} });
    expect(perms.resourceIdsWithVerb("space", "read")).toEqual({
      kind: "ids",
      resourceIds: [],
    });
  });
});

describe("GRANT_VERBS bit-position stability", () => {
  // Each verb is stored as bit `1 << its index in GRANT_VERBS` (see VERB_BIT), and those masks are
  // serialized into in-flight Temporal payloads. So the positions must stay stable: only append new
  // verbs at the end — never reorder or remove an existing one, and never exceed 31 (JS bitwise
  // operators are 32-bit, so `1 << 31` flips the sign bit and corrupts masks). These are the
  // invariants documented on `GRANT_VERBS`; this test enforces them instead of trusting the comment.

  // The verbs and their frozen bit positions. Append new verbs AFTER this list; do not edit it.
  // Typed as `GrantVerb[]` so removing a verb from the union also fails to compile here.
  const FROZEN_VERB_ORDER: GrantVerb[] = [
    "read",
    "write",
    "admin",
    "create",
    "publish",
    "invite",
    "use",
    "make_discoverable",
  ];

  it("keeps every existing verb at its original index (append-only)", () => {
    FROZEN_VERB_ORDER.forEach((verb, index) => {
      expect(GRANT_VERBS[index]).toBe(verb);
    });
  });

  it("stays within the 31-verb bitmask limit", () => {
    expect(GRANT_VERBS.length).toBeLessThanOrEqual(31);
  });

  it("has no duplicate verbs", () => {
    expect(new Set(GRANT_VERBS).size).toBe(GRANT_VERBS.length);
  });
});
