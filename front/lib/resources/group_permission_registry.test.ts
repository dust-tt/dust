import {
  assertValidGrant,
  GroupPermissions,
  grantTypesForVerb,
  ROLE_REGISTRY,
} from "@app/lib/resources/group_permission_registry";
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

  it("keeps every type-level role a singleton whose name is its verb", () => {
    for (const roles of roleMaps) {
      for (const [name, role] of Object.entries(roles)) {
        if (role.levels.includes("type")) {
          expect(role.verbs).toHaveLength(1);
          expect(name).toBe(role.verbs[0]);
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
