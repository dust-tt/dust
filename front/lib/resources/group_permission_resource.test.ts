import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
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
    groupA = await GroupFactory.regularAuto(workspace, "A");
    // Manual: a second regular_auto group may not share an instance-level tuple with groupA.
    groupB = await GroupFactory.regularManual(workspace, "B");
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  });

  describe("grant", () => {
    it("creates an instance-level grant that is readable", async () => {
      await GroupPermissionResource.grant(auth, {
        group: groupA,
        grantType: "reader",
        resourceType: "space",
        resourceId: 42,
      });

      const grants = await GroupPermissionResource.listForGroups(auth, {
        groupModelIds: [groupA.id],
      });
      expect(grants).toHaveLength(1);
      expect(grants[0].grantType).toBe("reader");
      expect(grants[0].resourceType).toBe("space");
      expect(grants[0].resourceId).toBe(42);
    });

    it("is idempotent (unique index dedupes)", async () => {
      const spec = {
        group: groupA,
        grantType: "editor" as const,
        resourceType: "agent" as const,
        resourceId: 7,
      };
      await GroupPermissionResource.grant(auth, spec);
      await GroupPermissionResource.grant(auth, spec);

      const grants = await GroupPermissionResource.listForGroups(auth, {
        groupModelIds: [groupA.id],
      });
      expect(grants).toHaveLength(1);
    });

    it("rejects a type-wide grant (resourceId = -1)", async () => {
      await expect(
        GroupPermissionResource.grant(auth, {
          group: groupA,
          grantType: "reader",
          resourceType: "space",
          resourceId: -1,
        })
      ).rejects.toThrow(/instance-level/);
    });

    it("rejects a grant that violates the registry", async () => {
      await expect(
        GroupPermissionResource.grant(auth, {
          group: groupA,
          grantType: "invite",
          resourceType: "space",
          resourceId: 5,
        })
      ).rejects.toThrow(/not allowed/);
    });

    it("rejects a second regular_auto group on the same tuple", async () => {
      await GroupPermissionResource.grant(auth, {
        group: groupA,
        grantType: "editor",
        resourceType: "agent",
        resourceId: 7,
      });

      const otherAutoGroup = await GroupFactory.regularAuto(workspace, "C");
      await expect(
        GroupPermissionResource.grant(auth, {
          group: otherAutoGroup,
          grantType: "editor",
          resourceType: "agent",
          resourceId: 7,
        })
      ).rejects.toThrow(/regular_auto/);

      // A non-auto group on the same tuple stays legal (grants are additive across groups).
      await GroupPermissionResource.grant(auth, {
        group: groupB,
        grantType: "editor",
        resourceType: "agent",
        resourceId: 7,
      });
    });

    it("rejects a group from another workspace", async () => {
      const otherWorkspace = await WorkspaceFactory.basic();
      await GroupFactory.defaults(otherWorkspace);
      const otherGroup = await GroupFactory.regularAuto(
        otherWorkspace,
        "other"
      );

      await expect(
        GroupPermissionResource.grant(auth, {
          group: otherGroup,
          grantType: "reader",
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
        grantType: "reader",
        resourceType: "space",
        resourceId: 1,
      });
      await GroupPermissionResource.grant(auth, {
        group: groupB,
        grantType: "member",
        resourceType: "space",
        resourceId: 1,
      });

      const grants = await GroupPermissionResource.listForGroups(auth, {
        groupModelIds: [groupA.id, groupB.id],
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
        groupModelIds: [],
      });
      expect(grants).toEqual([]);
    });
  });

  describe("revoke", () => {
    it("removes a specific grant only", async () => {
      await GroupPermissionResource.grant(auth, {
        group: groupA,
        grantType: "reader",
        resourceType: "space",
        resourceId: 1,
      });
      await GroupPermissionResource.grant(auth, {
        group: groupA,
        grantType: "member",
        resourceType: "space",
        resourceId: 1,
      });

      await GroupPermissionResource.revoke(auth, {
        group: groupA,
        grantType: "reader",
        resourceType: "space",
        resourceId: 1,
      });

      const grants = await GroupPermissionResource.listForGroups(auth, {
        groupModelIds: [groupA.id],
      });
      expect(grants).toHaveLength(1);
      expect(grants[0].grantType).toBe("member");
    });

    it("keeps overlapping roles independent on revoke (revoke-collision regression)", async () => {
      // `member` (read, write) and `admin` (read, write, admin) share verbs. Storing the role name
      // keeps them as two distinct rows, so revoking `member` cannot destroy the read/write the
      // group still holds via `admin`. (Under verb storage both roles would collapse onto shared
      // read/write rows and revoking `member` would delete them.)
      await GroupPermissionResource.grant(auth, {
        group: groupA,
        grantType: "member",
        resourceType: "space",
        resourceId: 1,
      });
      await GroupPermissionResource.grant(auth, {
        group: groupA,
        grantType: "admin",
        resourceType: "space",
        resourceId: 1,
      });

      await GroupPermissionResource.revoke(auth, {
        group: groupA,
        grantType: "member",
        resourceType: "space",
        resourceId: 1,
      });

      const grants = await GroupPermissionResource.listForGroups(auth, {
        groupModelIds: [groupA.id],
      });
      expect(grants).toHaveLength(1);
      expect(grants[0].grantType).toBe("admin");
    });
  });

  describe("deleteAllForResource", () => {
    it("drops every group's grants for one resource", async () => {
      await GroupPermissionResource.grant(auth, {
        group: groupA,
        grantType: "editor",
        resourceType: "agent",
        resourceId: 99,
      });
      await GroupPermissionResource.grant(auth, {
        group: groupB,
        grantType: "editor",
        resourceType: "agent",
        resourceId: 99,
      });
      // A grant on a different resource must survive.
      await GroupPermissionResource.grant(auth, {
        group: groupA,
        grantType: "editor",
        resourceType: "agent",
        resourceId: 100,
      });

      const deleted = await GroupPermissionResource.deleteAllForResource(auth, {
        resourceType: "agent",
        resourceId: 99,
      });
      expect(deleted).toBe(2);

      const remaining = await GroupPermissionResource.listForGroups(auth, {
        groupModelIds: [groupA.id, groupB.id],
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

  describe("deleteAllForWorkspace", () => {
    it("drops every grant for the workspace (scrub hook)", async () => {
      await GroupPermissionResource.grant(auth, {
        group: groupA,
        grantType: "reader",
        resourceType: "space",
        resourceId: 1,
      });
      await GroupPermissionResource.grant(auth, {
        group: groupB,
        grantType: "editor",
        resourceType: "agent",
        resourceId: 2,
      });

      await GroupPermissionResource.deleteAllForWorkspace(auth);

      const remaining = await GroupPermissionResource.listForGroups(auth, {
        groupModelIds: [groupA.id, groupB.id],
      });
      expect(remaining).toEqual([]);
    });
  });

  describe("grantTypeWide", () => {
    it("writes a type-wide (-1) grant and dedupes on repeat", async () => {
      await GroupPermissionResource.grantTypeWide(auth, {
        group: groupA,
        grantType: "create",
        resourceType: "agent",
      });
      await GroupPermissionResource.grantTypeWide(auth, {
        group: groupA,
        grantType: "create",
        resourceType: "agent",
      });

      const grants = await GroupPermissionResource.listForGroups(auth, {
        groupModelIds: [groupA.id],
      });
      expect(grants).toHaveLength(1);
      expect(grants[0].resourceId).toBe(-1);
    });

    it("rejects a grant type the registry does not allow", async () => {
      await expect(
        GroupPermissionResource.grantTypeWide(auth, {
          group: groupA,
          grantType: "create",
          resourceType: "billing",
        })
      ).rejects.toThrow(/not allowed/);
    });

    it("revokeTypeWide removes the -1 row", async () => {
      await GroupPermissionResource.grantTypeWide(auth, {
        group: groupA,
        grantType: "admin",
        resourceType: "billing",
      });
      await GroupPermissionResource.revokeTypeWide(auth, {
        group: groupA,
        grantType: "admin",
        resourceType: "billing",
      });

      const grants = await GroupPermissionResource.listForGroups(auth, {
        groupModelIds: [groupA.id],
      });
      expect(grants).toHaveLength(0);
    });
  });

  describe("batch writes", () => {
    it("grantTypeWideForGroups writes one -1 row per group", async () => {
      await GroupPermissionResource.grantTypeWideForGroups(auth, {
        groups: [groupA, groupB],
        grantType: "create",
        resourceType: "skill",
      });

      const grants = await GroupPermissionResource.listForGroups(auth, {
        groupModelIds: [groupA.id, groupB.id],
      });
      expect(grants).toHaveLength(2);
      expect(grants.every((g) => g.resourceId === -1)).toBe(true);
    });

    it("grantMany dedupes duplicate instance grants via the unique index", async () => {
      await GroupPermissionResource.grantMany(auth, {
        grants: [
          {
            group: groupB,
            grantType: "reader",
            resourceType: "space",
            resourceId: 1,
          },
          {
            group: groupB,
            grantType: "reader",
            resourceType: "space",
            resourceId: 1,
          },
          {
            group: groupB,
            grantType: "reader",
            resourceType: "space",
            resourceId: 2,
          },
        ],
      });

      const grants = await GroupPermissionResource.listForGroups(auth, {
        groupModelIds: [groupB.id],
      });
      expect(grants).toHaveLength(2);
    });

    it("grantMany rejects a -1 grant", async () => {
      await expect(
        GroupPermissionResource.grantMany(auth, {
          grants: [
            {
              group: groupB,
              grantType: "reader",
              resourceType: "space",
              resourceId: -1,
            },
          ],
        })
      ).rejects.toThrow(/instance-level/);
    });

    it("grantMany rejects regular_auto groups", async () => {
      await expect(
        GroupPermissionResource.grantMany(auth, {
          grants: [
            {
              group: groupA,
              grantType: "reader",
              resourceType: "space",
              resourceId: 1,
            },
          ],
        })
      ).rejects.toThrow(/regular_auto/);
    });
  });

  describe("grantToUser / revokeFromUser", () => {
    it("creates a regular_auto group, grants access, and adds the user", async () => {
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "user" });

      const result = await GroupPermissionResource.grantToUser(auth, {
        user: user.toJSON(),
        grantType: "reader",
        resourceType: "space",
        resourceId: 42,
      });
      expect(result.isOk()).toBe(true);

      const grants = await GroupPermissionResource.listForGroups(auth, {
        groupModelIds: (
          await GroupResource.listAllWorkspaceGroups(auth, {
            groupKinds: ["regular_auto"],
          })
        ).map((group) => group.id),
        grantType: "reader",
        resourceType: "space",
        resourceId: 42,
      });
      expect(grants).toHaveLength(1);

      const group = await GroupResource.fetchByModelIds(auth, [
        grants[0].groupId,
      ]);
      expect(group[0].kind).toBe("regular_auto");
      expect(await group[0].isMember(user)).toBe(true);
    });

    it("is idempotent for a repeat grant to the same user", async () => {
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "user" });

      const spec = {
        user: user.toJSON(),
        grantType: "reader" as const,
        resourceType: "space" as const,
        resourceId: 42,
      };
      await GroupPermissionResource.grantToUser(auth, spec);
      const repeat = await GroupPermissionResource.grantToUser(auth, spec);
      expect(repeat.isOk()).toBe(true);

      const grants = await GroupPermissionResource.listForGroups(auth, {
        groupModelIds: (
          await GroupResource.listAllWorkspaceGroups(auth, {
            groupKinds: ["regular_auto"],
          })
        ).map((group) => group.id),
        grantType: "reader",
        resourceType: "space",
        resourceId: 42,
      });
      expect(grants).toHaveLength(1);

      const [backingGroup] = await GroupResource.fetchByModelIds(auth, [
        grants[0].groupId,
      ]);
      expect(await backingGroup.getMemberCount(auth)).toBe(1);
    });

    it("reuses the existing regular_auto group for a second user", async () => {
      const user1 = await UserFactory.basic();
      const user2 = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user1, { role: "user" });
      await MembershipFactory.associate(workspace, user2, { role: "user" });

      await GroupPermissionResource.grantToUser(auth, {
        user: user1.toJSON(),
        grantType: "editor",
        resourceType: "agent",
        resourceId: 7,
      });
      await GroupPermissionResource.grantToUser(auth, {
        user: user2.toJSON(),
        grantType: "editor",
        resourceType: "agent",
        resourceId: 7,
      });

      const autoGroups = await GroupResource.listAllWorkspaceGroups(auth, {
        groupKinds: ["regular_auto"],
      });
      const grantGroups = [];
      for (const group of autoGroups) {
        const grants = await GroupPermissionResource.listForGroups(auth, {
          groupModelIds: [group.id],
          grantType: "editor",
          resourceType: "agent",
          resourceId: 7,
        });
        if (grants.length > 0) {
          grantGroups.push(group);
        }
      }
      expect(grantGroups).toHaveLength(1);
      expect(await grantGroups[0].isMember(user1)).toBe(true);
      expect(await grantGroups[0].isMember(user2)).toBe(true);
    });

    it("revokes access and deletes the group when the last member is removed", async () => {
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "user" });

      await GroupPermissionResource.grantToUser(auth, {
        user: user.toJSON(),
        grantType: "editor",
        resourceType: "skill",
        resourceId: 99,
      });

      const result = await GroupPermissionResource.revokeFromUser(auth, {
        user: user.toJSON(),
        grantType: "editor",
        resourceType: "skill",
        resourceId: 99,
      });
      expect(result.isOk()).toBe(true);

      const autoGroups = await GroupResource.listAllWorkspaceGroups(auth, {
        groupKinds: ["regular_auto"],
      });
      const grants = await GroupPermissionResource.listForGroups(auth, {
        groupModelIds: autoGroups.map((group) => group.id),
        grantType: "editor",
        resourceType: "skill",
        resourceId: 99,
      });
      expect(grants).toHaveLength(0);
    });

    it("keeps the group when other members remain", async () => {
      const user1 = await UserFactory.basic();
      const user2 = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user1, { role: "user" });
      await MembershipFactory.associate(workspace, user2, { role: "user" });

      await GroupPermissionResource.grantToUser(auth, {
        user: user1.toJSON(),
        grantType: "reader",
        resourceType: "space",
        resourceId: 5,
      });
      await GroupPermissionResource.grantToUser(auth, {
        user: user2.toJSON(),
        grantType: "reader",
        resourceType: "space",
        resourceId: 5,
      });

      const result = await GroupPermissionResource.revokeFromUser(auth, {
        user: user1.toJSON(),
        grantType: "reader",
        resourceType: "space",
        resourceId: 5,
      });
      expect(result.isOk()).toBe(true);

      const grants = await GroupPermissionResource.listForGroups(auth, {
        groupModelIds: (
          await GroupResource.listAllWorkspaceGroups(auth, {
            groupKinds: ["regular_auto"],
          })
        ).map((group) => group.id),
        grantType: "reader",
        resourceType: "space",
        resourceId: 5,
      });
      expect(grants).toHaveLength(1);

      const [group] = await GroupResource.fetchByModelIds(auth, [
        grants[0].groupId,
      ]);
      expect(await group.isMember(user1)).toBe(false);
      expect(await group.isMember(user2)).toBe(true);
    });
  });

  describe("grantToEverybody / revokeFromEverybody", () => {
    it("grants and revokes an instance-level permission on the global group", async () => {
      const globalGroup = await GroupResource.internalFetchWorkspaceGlobalGroup(
        workspace.id
      );
      if (!globalGroup) {
        throw new Error("global group should exist");
      }

      await GroupPermissionResource.grantToEverybody(auth, {
        grantType: "reader",
        resourceType: "space",
        resourceId: 42,
      });

      const grants = await GroupPermissionResource.listForGroups(auth, {
        groupModelIds: [globalGroup.id],
        grantType: "reader",
        resourceType: "space",
        resourceId: 42,
      });
      expect(grants).toHaveLength(1);

      await GroupPermissionResource.revokeFromEverybody(auth, {
        grantType: "reader",
        resourceType: "space",
        resourceId: 42,
      });
      expect(
        await GroupPermissionResource.listForGroups(auth, {
          groupModelIds: [globalGroup.id],
          grantType: "reader",
          resourceType: "space",
          resourceId: 42,
        })
      ).toHaveLength(0);
    });

    it("rejects type-wide grants", async () => {
      await expect(
        GroupPermissionResource.grantToEverybody(auth, {
          grantType: "create",
          resourceType: "agent",
          resourceId: -1,
        })
      ).rejects.toThrow(/instance-level/);
    });
  });
});
