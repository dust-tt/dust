import { assertValidGrant } from "@app/lib/resources/group_permission_registry";
import { WHOLE_TYPE_RESOURCE_ID } from "@app/types/group_permissions";
import { describe, expect, it } from "vitest";

describe("assertValidGrant", () => {
  describe("accepts valid combinations", () => {
    it("instance-level grant with a real resourceId", () => {
      expect(() =>
        assertValidGrant({
          permissionType: "read",
          resourceType: "space",
          resourceId: 5,
        })
      ).not.toThrow();
    });

    it("instance-level verb with -1 (all resources of the type)", () => {
      expect(() =>
        assertValidGrant({
          permissionType: "write",
          resourceType: "agent",
          resourceId: WHOLE_TYPE_RESOURCE_ID,
        })
      ).not.toThrow();
    });

    it("type-level verb (create) with -1", () => {
      expect(() =>
        assertValidGrant({
          permissionType: "create",
          resourceType: "skill",
          resourceId: WHOLE_TYPE_RESOURCE_ID,
        })
      ).not.toThrow();
    });

    it("instance-less domain with -1", () => {
      expect(() =>
        assertValidGrant({
          permissionType: "admin",
          resourceType: "billing",
          resourceId: WHOLE_TYPE_RESOURCE_ID,
        })
      ).not.toThrow();
    });

    it("full wildcard with -1", () => {
      expect(() =>
        assertValidGrant({
          permissionType: "*",
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
          permissionType: "invite",
          resourceType: "space",
          resourceId: 5,
        })
      ).toThrow(/not allowed/);
    });

    it("real resourceId on an instance-less domain", () => {
      expect(() =>
        assertValidGrant({
          permissionType: "admin",
          resourceType: "billing",
          resourceId: 5,
        })
      ).toThrow(/type-level/);
    });

    it("real resourceId on a type-level verb (create)", () => {
      expect(() =>
        assertValidGrant({
          permissionType: "create",
          resourceType: "agent",
          resourceId: 5,
        })
      ).toThrow(/type-level/);
    });

    it("wildcard permission with a real resourceId", () => {
      expect(() =>
        assertValidGrant({
          permissionType: "*",
          resourceType: "agent",
          resourceId: 5,
        })
      ).toThrow(/Wildcard/);
    });

    it("zero resourceId (neither a real id nor the sentinel)", () => {
      expect(() =>
        assertValidGrant({
          permissionType: "read",
          resourceType: "space",
          resourceId: 0,
        })
      ).toThrow(/positive resourceId/);
    });
  });
});
