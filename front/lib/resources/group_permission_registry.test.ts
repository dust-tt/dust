import {
  assertValidGrant,
  ROLE_REGISTRY,
} from "@app/lib/resources/group_permission_registry";
import {
  GRANT_TYPES,
  WHOLE_TYPE_RESOURCE_ID,
} from "@app/types/group_permissions";
import { describe, expect, it } from "vitest";

describe("assertValidGrant", () => {
  describe("accepts valid combinations", () => {
    it("instance-level grant with a real resourceId", () => {
      expect(() =>
        assertValidGrant({
          grantType: "read",
          resourceType: "space",
          resourceId: 5,
        })
      ).not.toThrow();
    });

    it("instance-level write on an agent (editor role)", () => {
      expect(() =>
        assertValidGrant({
          grantType: "write",
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

    it("type-level verb (create) with -1", () => {
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
    it("verb not allowed on the resource type", () => {
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

    it("real resourceId on a type-level verb (create)", () => {
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
          grantType: "read",
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

    it("type-wide write on an agent (editor is instance-only)", () => {
      expect(() =>
        assertValidGrant({
          grantType: "write",
          resourceType: "agent",
          resourceId: WHOLE_TYPE_RESOURCE_ID,
        })
      ).toThrow(/cannot be granted type-wide/);
    });

    it("type-wide grant on a space (space roles are instance-only)", () => {
      expect(() =>
        assertValidGrant({
          grantType: "read",
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
    // Every concrete verb in the vocabulary ("*" excluded) must be granted by some role.
    for (const verb of GRANT_TYPES) {
      if (verb !== "*") {
        expect(reachable.has(verb)).toBe(true);
      }
    }
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
});
