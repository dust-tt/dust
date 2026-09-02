import { getRedisCacheClient } from "@app/lib/api/redis";
import { Authenticator } from "@app/lib/auth";
import type { GroupGrant } from "@app/lib/resources/group_permission_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { grantKey } from "@app/types/group_permissions";
import { isString } from "@app/types/shared/utils/general";
import type { QueryOptions } from "sequelize";
import type { AbstractQuery } from "sequelize/types/dialects/abstract/query";
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

      const grants = await GroupPermissionResource.listForGroups(
        auth.getNonNullableWorkspace(),
        {
          groupModelIds: [groupA.id],
        }
      );
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

      const grants = await GroupPermissionResource.listForGroups(
        auth.getNonNullableWorkspace(),
        {
          groupModelIds: [groupA.id],
        }
      );
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

      const grants = await GroupPermissionResource.listForGroups(
        auth.getNonNullableWorkspace(),
        {
          groupModelIds: [groupA.id, groupB.id],
          resourceType: "space",
          resourceId: 1,
        }
      );
      expect(grants).toHaveLength(2);
      expect(new Set(grants.map((g) => g.groupId))).toEqual(
        new Set([groupA.id, groupB.id])
      );
    });

    it("returns [] for no groups without querying", async () => {
      const grants = await GroupPermissionResource.listForGroups(
        auth.getNonNullableWorkspace(),
        {
          groupModelIds: [],
        }
      );
      expect(grants).toEqual([]);
    });
  });

  describe("listForGroups", () => {
    // Grants are cached per group, so flush the workspace to exercise the database read.
    async function flushGrantCache() {
      const redis = await getRedisCacheClient({
        origin: "group_permissions_cache",
      });
      await redis.del(
        GroupPermissionResource.cacheOperations.buildKey({
          workspaceModelId: String(auth.getNonNullableWorkspace().id),
        })
      );
    }

    it("filters in Postgres through one bound bigint array", async () => {
      await GroupPermissionResource.grant(auth, {
        group: groupA,
        grantType: "reader",
        resourceType: "space",
        resourceId: 1,
      });
      await GroupPermissionResource.grant(auth, {
        group: groupB,
        grantType: "reader",
        resourceType: "space",
        resourceId: 2,
      });

      await flushGrantCache();

      let capturedQuery: { sql: string; bind: unknown } | undefined;
      const captureQueryHook = "capture-bound-group-permission-query";
      const captureQuery = (options: QueryOptions, query: AbstractQuery) => {
        const sql = Reflect.get(query, "sql");
        if (isString(sql) && sql.includes('FROM "group_permissions"')) {
          capturedQuery = { sql, bind: options.bind };
        }
      };
      frontSequelize.addHook("afterQuery", captureQueryHook, captureQuery);

      let grants: GroupGrant[];
      try {
        grants = await GroupPermissionResource.listForGroups(
          auth.getNonNullableWorkspace(),
          { groupModelIds: [groupA.id] }
        );
      } finally {
        frontSequelize.removeHook("afterQuery", captureQueryHook);
      }

      expect(grants.map((grant) => grant.groupId)).toEqual([groupA.id]);
      expect(capturedQuery?.sql).toContain(
        '"group_permissions"."groupId" = ANY ($1::bigint[])'
      );
      expect(capturedQuery?.sql).not.toContain('"groupId" IN (');
      expect(capturedQuery?.bind).toEqual({ groupModelIds: [groupA.id] });
    });

    it("keeps a large group set in one bind and applies optional filters", async () => {
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
        resourceId: 2,
      });

      const groupModelIds = [
        groupA.id,
        groupB.id,
        ...Array.from({ length: 8_192 }, (_, index) => 1_000_000 + index),
      ];
      await flushGrantCache();

      let capturedQuery: { sql: string; bind: unknown } | undefined;
      const captureQueryHook = "capture-large-group-permission-query";
      const captureQuery = (options: QueryOptions, query: AbstractQuery) => {
        const sql = Reflect.get(query, "sql");
        if (isString(sql) && sql.includes('FROM "group_permissions"')) {
          capturedQuery = { sql, bind: options.bind };
        }
      };
      frontSequelize.addHook("afterQuery", captureQueryHook, captureQuery);

      let grants: GroupGrant[];
      try {
        grants = await GroupPermissionResource.listForGroups(
          auth.getNonNullableWorkspace(),
          {
            groupModelIds,
            grantType: "member",
            resourceType: "space",
            resourceId: 2,
          }
        );
      } finally {
        frontSequelize.removeHook("afterQuery", captureQueryHook);
      }

      expect(grants.map((grant) => grant.groupId)).toEqual([groupB.id]);
      expect(capturedQuery?.sql).toContain(
        '"group_permissions"."groupId" = ANY ($1::bigint[])'
      );
      expect(capturedQuery?.sql).not.toContain('"groupId" IN (');
      expect(capturedQuery?.bind).toEqual({ groupModelIds });
    });
  });

  describe("listForResource", () => {
    it("returns the resource's own grants plus the type-wide (-1) grants, and nothing else", async () => {
      // Instance grant on agent 7.
      await GroupPermissionResource.grant(auth, {
        group: groupB,
        grantType: "editor",
        resourceType: "agent",
        resourceId: 7,
      });
      // Type-wide grant on the whole agent type.
      await GroupPermissionResource.grantTypeWide(auth, {
        group: groupA,
        grantType: "create",
        resourceType: "agent",
      });
      // Another instance of the same type, and a different resource type: both excluded.
      await GroupPermissionResource.grant(auth, {
        group: groupB,
        grantType: "editor",
        resourceType: "agent",
        resourceId: 8,
      });
      await GroupPermissionResource.grant(auth, {
        group: groupB,
        grantType: "reader",
        resourceType: "space",
        resourceId: 7,
      });

      const grants = await GroupPermissionResource.listForResource(auth, {
        resourceType: "agent",
        resourceId: 7,
      });

      expect(grants).toHaveLength(2);
      expect(grants.every((g) => g.resourceType === "agent")).toBe(true);
      expect(new Set(grants.map((g) => g.resourceId))).toEqual(
        new Set([7, -1])
      );
    });

    it("does not duplicate the type-wide rows when resourceId is itself -1 (Op.in dedupe)", async () => {
      // A single type-wide (-1) grant. Querying with resourceId = -1 builds an Op.in of [-1, -1],
      // so the row must come back exactly once rather than twice.
      await GroupPermissionResource.grantTypeWide(auth, {
        group: groupA,
        grantType: "create",
        resourceType: "agent",
      });

      const grants = await GroupPermissionResource.listForResource(auth, {
        resourceType: "agent",
        resourceId: -1,
      });

      expect(grants).toHaveLength(1);
      expect(grants[0].resourceId).toBe(-1);
      expect(grants[0].grantType).toBe("create");
    });

    it("is scoped to the authenticated workspace", async () => {
      const otherWorkspace = await WorkspaceFactory.basic();
      await GroupFactory.defaults(otherWorkspace);
      const otherGroup = await GroupFactory.regularManual(
        otherWorkspace,
        "other"
      );
      const otherAuth = await Authenticator.internalAdminForWorkspace(
        otherWorkspace.sId
      );
      await GroupPermissionResource.grant(otherAuth, {
        group: otherGroup,
        grantType: "editor",
        resourceType: "agent",
        resourceId: 7,
      });

      expect(
        await GroupPermissionResource.listForResource(auth, {
          resourceType: "agent",
          resourceId: 7,
        })
      ).toHaveLength(0);
    });
  });

  describe("listForGroup", () => {
    it("returns every grant held by the group across resource types and instances", async () => {
      await GroupPermissionResource.grant(auth, {
        group: groupB,
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
      await GroupPermissionResource.grantTypeWide(auth, {
        group: groupB,
        grantType: "create",
        resourceType: "skill",
      });
      // A grant on another group must be excluded.
      await GroupPermissionResource.grant(auth, {
        group: groupA,
        grantType: "reader",
        resourceType: "space",
        resourceId: 3,
      });

      const grants = await GroupPermissionResource.listForGroup(auth, groupB);

      expect(grants).toHaveLength(3);
      expect(grants.every((g) => g.groupId === groupB.id)).toBe(true);
      expect(new Set(grants.map((g) => g.resourceType))).toEqual(
        new Set(["space", "agent", "skill"])
      );
    });

    it("returns [] for a group with no grants", async () => {
      expect(await GroupPermissionResource.listForGroup(auth, groupB)).toEqual(
        []
      );
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

      const grants = await GroupPermissionResource.listForGroups(
        auth.getNonNullableWorkspace(),
        {
          groupModelIds: [groupA.id],
        }
      );
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

      const grants = await GroupPermissionResource.listForGroups(
        auth.getNonNullableWorkspace(),
        {
          groupModelIds: [groupA.id],
        }
      );
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

      const remaining = await GroupPermissionResource.listForGroups(
        auth.getNonNullableWorkspace(),
        {
          groupModelIds: [groupA.id, groupB.id],
        }
      );
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

      const remaining = await GroupPermissionResource.listForGroups(
        auth.getNonNullableWorkspace(),
        {
          groupModelIds: [groupA.id, groupB.id],
        }
      );
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

      const grants = await GroupPermissionResource.listForGroups(
        auth.getNonNullableWorkspace(),
        {
          groupModelIds: [groupA.id],
        }
      );
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

      const grants = await GroupPermissionResource.listForGroups(
        auth.getNonNullableWorkspace(),
        {
          groupModelIds: [groupA.id],
        }
      );
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

      const grants = await GroupPermissionResource.listForGroups(
        auth.getNonNullableWorkspace(),
        {
          groupModelIds: [groupA.id, groupB.id],
        }
      );
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

      const grants = await GroupPermissionResource.listForGroups(
        auth.getNonNullableWorkspace(),
        {
          groupModelIds: [groupB.id],
        }
      );
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

      const groups =
        await GroupPermissionResource.listRegularAutoGroupsForResource(auth, {
          resourceType: "space",
          resourceId: 42,
        });
      expect(groups).toHaveLength(1);
      expect(await groups[0].isMember(user)).toBe(true);
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

      const groups =
        await GroupPermissionResource.listRegularAutoGroupsForResource(auth, {
          resourceType: "space",
          resourceId: 42,
        });
      expect(groups).toHaveLength(1);
      expect(await groups[0].getMemberCount(auth)).toBe(1);
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

      const groups =
        await GroupPermissionResource.listRegularAutoGroupsForResource(auth, {
          resourceType: "agent",
          resourceId: 7,
        });
      expect(groups).toHaveLength(1);
      expect(await groups[0].isMember(user1)).toBe(true);
      expect(await groups[0].isMember(user2)).toBe(true);
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

      const groups =
        await GroupPermissionResource.listRegularAutoGroupsForResource(auth, {
          resourceType: "skill",
          resourceId: 99,
        });
      expect(groups).toHaveLength(1);

      const result = await GroupPermissionResource.revokeFromUser(auth, {
        user: user.toJSON(),
        grantType: "editor",
        resourceType: "skill",
        resourceId: 99,
      });
      expect(result.isOk()).toBe(true);

      const resultGroups =
        await GroupPermissionResource.listRegularAutoGroupsForResource(auth, {
          resourceType: "skill",
          resourceId: 99,
        });
      expect(resultGroups).toHaveLength(0);
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

      const groups =
        await GroupPermissionResource.listRegularAutoGroupsForResource(auth, {
          resourceType: "space",
          resourceId: 5,
        });
      expect(groups).toHaveLength(1);
      expect(await groups[0].isMember(user1)).toBe(false);
      expect(await groups[0].isMember(user2)).toBe(true);
    });
  });

  describe("findRegularAutoGroupForGrant / findRegularAutoGroupsForGrants", () => {
    async function grantToNewUser(spec: {
      grantType: "reader" | "member";
      resourceType: "space";
      resourceId: number;
    }) {
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "user" });
      const result = await GroupPermissionResource.grantToUser(auth, {
        user: user.toJSON(),
        ...spec,
      });
      expect(result.isOk()).toBe(true);
    }

    const readerOnSpace = (resourceId: number) => ({
      grantType: "reader" as const,
      resourceType: "space" as const,
      resourceId,
    });

    it("finds the backing group of a tuple, and null when there is none", async () => {
      await grantToNewUser(readerOnSpace(42));

      const found = await GroupPermissionResource.findRegularAutoGroupForGrant(
        auth,
        readerOnSpace(42)
      );
      expect(found?.kind).toBe("regular_auto");

      // Same resource, a grant type nobody was granted.
      expect(
        await GroupPermissionResource.findRegularAutoGroupForGrant(auth, {
          ...readerOnSpace(42),
          grantType: "member",
        })
      ).toBeNull();

      // Same grant type, a resource nobody was granted.
      expect(
        await GroupPermissionResource.findRegularAutoGroupForGrant(
          auth,
          readerOnSpace(43)
        )
      ).toBeNull();
    });

    it("ignores grants held by groups that are not regular_auto", async () => {
      // groupA is regular_auto but holds this tuple through grant(), not grantToUser: still the
      // backing group. groupB is manual, so it must never be returned.
      await GroupPermissionResource.grant(auth, {
        group: groupB,
        ...readerOnSpace(50),
      });

      expect(
        await GroupPermissionResource.findRegularAutoGroupForGrant(
          auth,
          readerOnSpace(50)
        )
      ).toBeNull();
    });

    it("batches lookups, keyed by grant", async () => {
      await grantToNewUser(readerOnSpace(60));
      await grantToNewUser({ ...readerOnSpace(61), grantType: "member" });

      const found =
        await GroupPermissionResource.findRegularAutoGroupsForGrants(auth, {
          grants: [
            readerOnSpace(60),
            { ...readerOnSpace(61), grantType: "member" },
            // Not granted: absent from the result rather than mapped to null.
            readerOnSpace(62),
          ],
        });

      expect(found.size).toBe(2);
      expect(found.get(grantKey(readerOnSpace(60)))?.kind).toBe("regular_auto");
      expect(
        found.get(grantKey({ ...readerOnSpace(61), grantType: "member" }))?.kind
      ).toBe("regular_auto");
      expect(found.get(grantKey(readerOnSpace(62)))).toBeUndefined();
    });

    it("keeps two grant types on the same resource apart", async () => {
      await grantToNewUser(readerOnSpace(70));
      await grantToNewUser({ ...readerOnSpace(70), grantType: "member" });

      const found =
        await GroupPermissionResource.findRegularAutoGroupsForGrants(auth, {
          grants: [
            readerOnSpace(70),
            { ...readerOnSpace(70), grantType: "member" },
          ],
        });

      // One entry per grant, and each tuple has its own backing group.
      expect(found.size).toBe(2);
      expect(found.get(grantKey(readerOnSpace(70)))?.id).not.toBe(
        found.get(grantKey({ ...readerOnSpace(70), grantType: "member" }))?.id
      );
    });

    it("returns an empty map for no grants", async () => {
      const found =
        await GroupPermissionResource.findRegularAutoGroupsForGrants(auth, {
          grants: [],
        });
      expect(found.size).toBe(0);
    });
  });

  describe("listRegularAutoGroupsForResource", () => {
    const onSpace = (resourceId: number) => ({
      resourceType: "space" as const,
      resourceId,
    });

    it("returns every regular_auto group with a grant on the resource, regardless of grant type", async () => {
      // A space's member group holds `member` and its editor group holds `admin`; both are
      // regular_auto and both must come back even though their grant types differ.
      const memberGroup = await GroupFactory.regularAuto(workspace, "member");
      const editorGroup = await GroupFactory.regularAuto(workspace, "editor");
      await GroupPermissionResource.grant(auth, {
        group: memberGroup,
        grantType: "member",
        ...onSpace(100),
      });
      await GroupPermissionResource.grant(auth, {
        group: editorGroup,
        grantType: "admin",
        ...onSpace(100),
      });

      const groups =
        await GroupPermissionResource.listRegularAutoGroupsForResource(
          auth,
          onSpace(100)
        );
      expect(groups.map((g) => g.id).sort()).toEqual(
        [memberGroup.id, editorGroup.id].sort()
      );
    });

    it("returns a regular_auto group even when it holds only a reader grant", async () => {
      // On an open regular space the member group (regular_auto) holds a `reader` grant just like the
      // global group; grant type can't tell them apart, so it must still be found by kind.
      await GroupPermissionResource.grant(auth, {
        group: groupA,
        grantType: "reader",
        ...onSpace(101),
      });

      const groups =
        await GroupPermissionResource.listRegularAutoGroupsForResource(
          auth,
          onSpace(101)
        );
      expect(groups.map((g) => g.id)).toEqual([groupA.id]);
    });

    it("excludes non-regular_auto groups (manual, provisioned, global)", async () => {
      const globalRes = await GroupResource.fetchWorkspaceGlobalGroup(auth);
      if (globalRes.isErr()) {
        throw globalRes.error;
      }
      const globalGroup = globalRes.value;
      const provisionedGroup = await GroupFactory.provisioned(
        workspace,
        "prov"
      );

      // Only groupA is regular_auto; the manual, provisioned, and global groups must be excluded.
      await GroupPermissionResource.grant(auth, {
        group: groupA,
        grantType: "member",
        ...onSpace(102),
      });
      await GroupPermissionResource.grant(auth, {
        group: groupB,
        grantType: "member",
        ...onSpace(102),
      });
      await GroupPermissionResource.grant(auth, {
        group: provisionedGroup,
        grantType: "member",
        ...onSpace(102),
      });
      await GroupPermissionResource.grant(auth, {
        group: globalGroup,
        grantType: "reader",
        ...onSpace(102),
      });

      const groups =
        await GroupPermissionResource.listRegularAutoGroupsForResource(
          auth,
          onSpace(102)
        );
      expect(groups.map((g) => g.id)).toEqual([groupA.id]);
    });

    it("returns an empty array when the resource has no grants", async () => {
      expect(
        await GroupPermissionResource.listRegularAutoGroupsForResource(
          auth,
          onSpace(999)
        )
      ).toEqual([]);
    });
  });

  describe("grantToEverybody / revokeFromEverybody", () => {
    it("grants and revokes an instance-level permission on the global group", async () => {
      const globalGroupRes =
        await GroupResource.fetchWorkspaceGlobalGroup(auth);
      if (globalGroupRes.isErr()) {
        throw new Error("global group should exist");
      }
      const globalGroup = globalGroupRes.value;

      await GroupPermissionResource.grantToEverybody(auth, {
        grantType: "reader",
        resourceType: "space",
        resourceId: 42,
      });

      const grants = await GroupPermissionResource.listForGroups(
        auth.getNonNullableWorkspace(),
        {
          groupModelIds: [globalGroup.id],
          grantType: "reader",
          resourceType: "space",
          resourceId: 42,
        }
      );
      expect(grants).toHaveLength(1);

      await GroupPermissionResource.revokeFromEverybody(auth, {
        grantType: "reader",
        resourceType: "space",
        resourceId: 42,
      });
      expect(
        await GroupPermissionResource.listForGroups(
          auth.getNonNullableWorkspace(),
          {
            groupModelIds: [globalGroup.id],
            grantType: "reader",
            resourceType: "space",
            resourceId: 42,
          }
        )
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
