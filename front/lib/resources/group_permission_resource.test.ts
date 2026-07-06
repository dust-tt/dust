import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { beforeEach, describe, expect, it } from "vitest";

describe("GroupPermissionResource", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let auth: Authenticator;
  let groupA: GroupResource;
  let groupB: GroupResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);
    groupA = await GroupFactory.regular(workspace, "A");
    groupB = await GroupFactory.regular(workspace, "B");
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  });

  describe("grant", () => {
    it("creates an instance-level grant that is readable", async () => {
      await GroupPermissionResource.grant(auth, {
        group: groupA,
        permissionType: "read",
        resourceType: "space",
        resourceId: 42,
      });

      const grants = await GroupPermissionResource.listForGroups(auth, {
        groupIds: [groupA.id],
      });
      expect(grants).toHaveLength(1);
      expect(grants[0].permissionType).toBe("read");
      expect(grants[0].resourceType).toBe("space");
      expect(grants[0].resourceId).toBe(42);
    });

    it("is idempotent (unique index dedupes)", async () => {
      const spec = {
        group: groupA,
        permissionType: "write" as const,
        resourceType: "agent" as const,
        resourceId: 7,
      };
      await GroupPermissionResource.grant(auth, spec);
      await GroupPermissionResource.grant(auth, spec);

      const grants = await GroupPermissionResource.listForGroups(auth, {
        groupIds: [groupA.id],
      });
      expect(grants).toHaveLength(1);
    });

    it("rejects a type-wide grant (resourceId = -1)", async () => {
      await expect(
        GroupPermissionResource.grant(auth, {
          group: groupA,
          permissionType: "read",
          resourceType: "space",
          resourceId: -1,
        })
      ).rejects.toThrow(/instance-level/);
    });

    it("rejects a grant that violates the registry", async () => {
      await expect(
        GroupPermissionResource.grant(auth, {
          group: groupA,
          permissionType: "invite",
          resourceType: "space",
          resourceId: 5,
        })
      ).rejects.toThrow(/not allowed/);
    });

    it("rejects a group from another workspace", async () => {
      const otherWorkspace = await WorkspaceFactory.basic();
      await GroupFactory.defaults(otherWorkspace);
      const otherGroup = await GroupFactory.regular(otherWorkspace, "other");

      await expect(
        GroupPermissionResource.grant(auth, {
          group: otherGroup,
          permissionType: "read",
          resourceType: "space",
          resourceId: 5,
        })
      ).rejects.toThrow(/does not belong/);
    });
  });

  describe("additivity across groups", () => {
    it("returns grants from every requested group", async () => {
      await GroupPermissionResource.grant(auth, {
        group: groupA,
        permissionType: "read",
        resourceType: "space",
        resourceId: 1,
      });
      await GroupPermissionResource.grant(auth, {
        group: groupB,
        permissionType: "write",
        resourceType: "space",
        resourceId: 1,
      });

      const grants = await GroupPermissionResource.listForGroups(auth, {
        groupIds: [groupA.id, groupB.id],
        resourceType: "space",
        resourceId: 1,
      });
      expect(grants).toHaveLength(2);
      expect(new Set(grants.map((g) => g.groupId))).toEqual(
        new Set([groupA.id, groupB.id])
      );
    });

    it("returns [] for no groups without querying", async () => {
      const grants = await GroupPermissionResource.listForGroups(auth, {
        groupIds: [],
      });
      expect(grants).toEqual([]);
    });
  });

  describe("revoke", () => {
    it("removes a specific grant only", async () => {
      await GroupPermissionResource.grant(auth, {
        group: groupA,
        permissionType: "read",
        resourceType: "space",
        resourceId: 1,
      });
      await GroupPermissionResource.grant(auth, {
        group: groupA,
        permissionType: "write",
        resourceType: "space",
        resourceId: 1,
      });

      await GroupPermissionResource.revoke(auth, {
        group: groupA,
        permissionType: "read",
        resourceType: "space",
        resourceId: 1,
      });

      const grants = await GroupPermissionResource.listForGroups(auth, {
        groupIds: [groupA.id],
      });
      expect(grants).toHaveLength(1);
      expect(grants[0].permissionType).toBe("write");
    });
  });

  describe("deleteAllForResource", () => {
    it("drops every group's grants for one resource", async () => {
      await GroupPermissionResource.grant(auth, {
        group: groupA,
        permissionType: "read",
        resourceType: "agent",
        resourceId: 99,
      });
      await GroupPermissionResource.grant(auth, {
        group: groupB,
        permissionType: "write",
        resourceType: "agent",
        resourceId: 99,
      });
      // A grant on a different resource must survive.
      await GroupPermissionResource.grant(auth, {
        group: groupA,
        permissionType: "read",
        resourceType: "agent",
        resourceId: 100,
      });

      const deleted = await GroupPermissionResource.deleteAllForResource(auth, {
        resourceType: "agent",
        resourceId: 99,
      });
      expect(deleted).toBe(2);

      const remaining = await GroupPermissionResource.listForGroups(auth, {
        groupIds: [groupA.id, groupB.id],
      });
      expect(remaining).toHaveLength(1);
      expect(remaining[0].resourceId).toBe(100);
    });

    it("refuses to clear type-wide grants", async () => {
      await expect(
        GroupPermissionResource.deleteAllForResource(auth, {
          resourceType: "agent",
          resourceId: -1,
        })
      ).rejects.toThrow(/type-wide/);
    });
  });
});
