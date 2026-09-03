import type { CacheableFunction, JsonSerializable } from "@app/lib/utils/cache";
import { getNamespace } from "@app/tests/utils/test_cls";
import { beforeEach, describe, expect, it, vi } from "vitest";

const inMemoryCache = vi.hoisted(() => new Map<string, string>());

vi.mock("@app/lib/api/redis", () => ({
  getRedisCacheClient: vi.fn().mockImplementation(() =>
    Promise.resolve({
      del: vi.fn().mockImplementation((keyOrKeys: string | string[]) => {
        const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
        keys.forEach((key) => inMemoryCache.delete(key));
        return Promise.resolve(keys.length);
      }),
    })
  ),
}));

vi.mock("@app/lib/utils/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/utils/cache")>();
  return {
    ...actual,
    cacheWithRedis: vi
      .fn()
      .mockImplementation(
        <T, Args extends unknown[]>(
          fn: CacheableFunction<JsonSerializable<T>, Args>,
          resolver: (...args: Args) => string
        ) => {
          return async (...args: Args): Promise<JsonSerializable<T>> => {
            const key = `cacheWithRedis-${fn.name}-${resolver(...args)}`;
            const cached = inMemoryCache.get(key);
            if (cached) {
              return JSON.parse(cached) as JsonSerializable<T>;
            }
            const result = await fn(...args);
            inMemoryCache.set(key, JSON.stringify(result));
            return result;
          };
        }
      ),
    invalidateCacheWithRedis: vi
      .fn()
      .mockImplementation(
        <T, Args extends unknown[]>(
          fn: CacheableFunction<JsonSerializable<T>, Args>,
          resolver: (...args: Args) => string
        ) => {
          return async (...args: Args): Promise<void> => {
            const key = `cacheWithRedis-${fn.name}-${resolver(...args)}`;
            inMemoryCache.delete(key);
          };
        }
      ),
    batchInvalidateCacheWithRedis: vi
      .fn()
      .mockImplementation(
        <T, Args extends unknown[]>(
          fn: CacheableFunction<JsonSerializable<T>, Args>,
          resolver: (...args: Args) => string
        ) => {
          return async (argsList: Args[]): Promise<void> => {
            for (const args of argsList) {
              const key = `cacheWithRedis-${fn.name}-${resolver(...args)}`;
              inMemoryCache.delete(key);
            }
          };
        }
      ),
  };
});

import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { UserResource } from "@app/lib/resources/user_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";

function getCacheKeyForUser(userId: number, workspaceId: number): string {
  // The function name is empty because an anonymous arrow function is passed to cacheWithRedis
  return `cacheWithRedis--groups:v2:user:${userId}:workspace:${workspaceId}`;
}

function getCacheKeyForWorkspaceGroupsFromSystemKey(
  workspaceId: number
): string {
  return `cacheWithRedis-_listWorkspaceGroupsFromSystemKeyUncached-workspace-groups-from-system-key:${workspaceId}`;
}

describe("GroupResource", () => {
  let workspace: LightWorkspaceType;
  let user: UserResource;
  let authenticator: Authenticator;
  let globalGroup: GroupResource;
  let systemGroup: GroupResource;

  beforeEach(async () => {
    const testSetup = await createResourceTest({ role: "admin" });
    workspace = testSetup.workspace;
    user = testSetup.user;
    authenticator = testSetup.authenticator;
    globalGroup = testSetup.globalGroup;
    systemGroup = testSetup.systemGroup;
    // Clear cache after setup since Authenticator creation may populate it
    inMemoryCache.clear();
  });

  describe("fetchByModelIds", () => {
    it("filters on group kind when asked", async () => {
      const autoGroup = await GroupResource.makeNew({
        name: "Auto Group",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });
      const ids = [autoGroup.id, globalGroup.id, systemGroup.id];

      const all = await GroupResource.dangerouslyFetchByModelIds(
        authenticator,
        ids
      );
      expect(all.map((g) => g.id).sort()).toEqual([...ids].sort());

      const autoOnly = await GroupResource.dangerouslyFetchByModelIds(
        authenticator,
        ids,
        {
          groupKinds: ["regular_auto"],
        }
      );
      expect(autoOnly.map((g) => g.id)).toEqual([autoGroup.id]);
    });
  });

  describe("dangerouslyListUserGroupsForAuth", () => {
    it("returns global group and explicit groups for a workspace member", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Test Group",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });
      await regularGroup.dangerouslyAddMembers(authenticator, {
        users: [user.toJSON()],
      });

      const { globalGroupModelId, groupModelIds } =
        await GroupResource.dangerouslyListUserGroupsForAuth({
          user,
          workspace,
        });

      expect(groupModelIds.length).toBe(2);
      expect(groupModelIds).toContain(globalGroup.id);
      expect(groupModelIds).toContain(regularGroup.id);
      expect(globalGroupModelId).toBe(globalGroup.id);
    });

    it("returns global group for non-member (no membership check)", async () => {
      const nonMember = await UserFactory.basic();

      const { globalGroupModelId, groupModelIds } =
        await GroupResource.dangerouslyListUserGroupsForAuth({
          user: nonMember,
          workspace,
        });

      expect(groupModelIds.length).toBe(1);
      expect(groupModelIds).toContain(globalGroup.id);
      expect(globalGroupModelId).toBe(globalGroup.id);
    });

    it("throws when global group is missing", async () => {
      // The global group now holds group_permissions rows (space grants); clear them first so the
      // group can be deleted (group_permissions.groupId FK is ON DELETE RESTRICT).
      const globalGroups = await GroupModel.findAll({
        where: { workspaceId: workspace.id, kind: "global" },
      });
      await GroupPermissionModel.destroy({
        where: {
          workspaceId: workspace.id,
          groupId: globalGroups.map((g) => g.id),
        },
      });
      await GroupModel.destroy({
        where: { workspaceId: workspace.id, kind: "global" },
      });

      await expect(
        GroupResource.dangerouslyListUserGroupsForAuth({
          user,
          workspace,
        })
      ).rejects.toThrow("Global group not found.");
    });
  });

  describe("listGroupNamesByUserModelIdInWorkspace", () => {
    it("returns regular manual + provisioned group names per user, sorted, excluding global", async () => {
      const user2 = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user2, { role: "user" });
      const user3 = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user3, { role: "user" });

      const sales = await GroupResource.makeNew({
        name: "Sales",
        workspaceId: workspace.id,
        kind: "regular_manual",
      });
      await sales.dangerouslyAddMembers(authenticator, {
        users: [user.toJSON()],
      });
      // Provisioned groups are synced from WorkOS; members are seeded directly.
      await GroupResource.makeNew(
        {
          name: "Engineering",
          workspaceId: workspace.id,
          kind: "provisioned",
          workOSGroupId: "fake-eng-group",
        },
        { memberIds: [user.id, user2.id] }
      );

      const result = await GroupResource.listGroupNamesByUserModelIdInWorkspace(
        {
          auth: authenticator,
          userModelIds: [user.id, user2.id, user3.id],
          groupKinds: [...MANAGEABLE_GROUP_KINDS],
        }
      );

      // user is implicitly in the global group, which must be excluded.
      expect(result.get(user.id)).toEqual(["Engineering", "Sales"]);
      expect(result.get(user2.id)).toEqual(["Engineering"]);
      expect(result.has(user3.id)).toBe(false);
    });

    it("returns an empty map when no user ids are given", async () => {
      const result = await GroupResource.listGroupNamesByUserModelIdInWorkspace(
        {
          auth: authenticator,
          userModelIds: [],
          groupKinds: [...MANAGEABLE_GROUP_KINDS],
        }
      );

      expect(result.size).toBe(0);
    });
  });

  describe("listUserGroupsInWorkspace with `at`", () => {
    const JANUARY = new Date("2026-01-15T00:00:00Z");
    const FEBRUARY = new Date("2026-02-15T00:00:00Z");
    const MARCH = new Date("2026-03-15T00:00:00Z");

    // Group memberships are historized by startAt/endAt, but no resource method
    // lets a caller choose those values, so the window is backdated directly.
    async function setGroupMembershipWindow(
      group: GroupResource,
      member: UserResource,
      { startAt, endAt }: { startAt: Date; endAt: Date | null }
    ) {
      await GroupMembershipModel.update(
        { startAt, endAt },
        {
          where: {
            workspaceId: workspace.id,
            groupId: group.id,
            userId: member.id,
          },
        }
      );
    }

    it("returns the groups the user was in at `at`, not today's groups", async () => {
      const member = await UserFactory.basic();
      await MembershipFactory.associate(workspace, member, {
        role: "user",
        startAt: JANUARY,
      });

      const sales = await GroupResource.makeNew({
        name: "Sales",
        workspaceId: workspace.id,
        kind: "regular_manual",
      });
      await sales.dangerouslyAddMembers(authenticator, {
        users: [member.toJSON()],
      });
      // In Sales from January until March.
      await setGroupMembershipWindow(sales, member, {
        startAt: JANUARY,
        endAt: MARCH,
      });

      const inFebruary = await GroupResource.listUserGroupsInWorkspace({
        auth: authenticator,
        user: member,
        groupKinds: ["regular_manual"],
        at: FEBRUARY,
      });
      expect(inFebruary.map((g) => g.name)).toEqual(["Sales"]);

      // Omitting `at` defaults to now, after the membership ended.
      const today = await GroupResource.listUserGroupsInWorkspace({
        auth: authenticator,
        user: member,
        groupKinds: ["regular_manual"],
      });
      expect(today).toEqual([]);
    });

    it("still resolves groups for a user who has since left the workspace", async () => {
      const member = await UserFactory.basic();
      await MembershipFactory.associate(workspace, member, {
        role: "user",
        startAt: JANUARY,
      });

      const sales = await GroupResource.makeNew({
        name: "Sales",
        workspaceId: workspace.id,
        kind: "regular_manual",
      });
      await sales.dangerouslyAddMembers(authenticator, {
        users: [member.toJSON()],
      });
      await setGroupMembershipWindow(sales, member, {
        startAt: JANUARY,
        endAt: null,
      });

      const revoked = await MembershipResource.revokeMembership({
        user: member,
        workspace,
        endAt: MARCH,
      });
      expect(revoked.isOk()).toBe(true);

      // The workspace membership gate is evaluated at `at` too, so a member who
      // left in March is still resolvable in February. This is what analytics
      // reindexing of their past messages depends on.
      const inFebruary = await GroupResource.listUserGroupsInWorkspace({
        auth: authenticator,
        user: member,
        groupKinds: ["regular_manual"],
        at: FEBRUARY,
      });
      expect(inFebruary.map((g) => g.name)).toEqual(["Sales"]);

      // Today they are no longer a workspace member.
      const today = await GroupResource.listUserGroupsInWorkspace({
        auth: authenticator,
        user: member,
        groupKinds: ["regular_manual"],
      });
      expect(today).toEqual([]);
    });

    it("excludes memberships that had not started yet at `at`", async () => {
      const member = await UserFactory.basic();
      await MembershipFactory.associate(workspace, member, {
        role: "user",
        startAt: JANUARY,
      });

      const sales = await GroupResource.makeNew({
        name: "Sales",
        workspaceId: workspace.id,
        kind: "regular_manual",
      });
      await sales.dangerouslyAddMembers(authenticator, {
        users: [member.toJSON()],
      });
      await setGroupMembershipWindow(sales, member, {
        startAt: FEBRUARY,
        endAt: null,
      });

      const inJanuary = await GroupResource.listUserGroupsInWorkspace({
        auth: authenticator,
        user: member,
        groupKinds: ["regular_manual"],
        at: JANUARY,
      });

      expect(inJanuary).toEqual([]);
    });
  });

  describe("dangerouslyListUserGroupsForAuth caching", () => {
    it("returns groups for authenticated user", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Auth Test Group",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });
      await regularGroup.dangerouslyAddMembers(authenticator, {
        users: [user.toJSON()],
      });

      const { groupModelIds } =
        await GroupResource.dangerouslyListUserGroupsForAuth({
          user,
          workspace,
        });

      expect(groupModelIds.length).toBe(2);
      expect(groupModelIds).toContain(globalGroup.id);
      expect(groupModelIds).toContain(regularGroup.id);
    });

    it("populates cache on first call", async () => {
      const cacheKey = getCacheKeyForUser(user.id, workspace.id);

      expect(inMemoryCache.has(cacheKey)).toBe(false);

      await GroupResource.dangerouslyListUserGroupsForAuth({ user, workspace });

      expect(inMemoryCache.has(cacheKey)).toBe(true);
    });

    it("serves from cache on second call", async () => {
      const cacheKey = getCacheKeyForUser(user.id, workspace.id);

      const groupIds1 = await GroupResource.dangerouslyListUserGroupsForAuth({
        user,
        workspace,
      });
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      const groupIds2 = await GroupResource.dangerouslyListUserGroupsForAuth({
        user,
        workspace,
      });
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      expect(groupIds1).toEqual(groupIds2);
    });
  });

  describe("dangerouslySetMembers", () => {
    it("returns the diff of added and removed users", async () => {
      const keptUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, keptUser, { role: "user" });
      const addedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, addedUser, { role: "user" });

      const group = await GroupResource.makeNew({
        name: "Set Members Test Group",
        workspaceId: workspace.id,
        kind: "regular_manual",
      });
      await group.dangerouslyAddMembers(authenticator, {
        users: [user.toJSON(), keptUser.toJSON()],
      });

      const result = await group.dangerouslySetMembers(authenticator, {
        users: [keptUser.toJSON(), addedUser.toJSON()],
      });

      if (result.isErr()) {
        throw new Error(`dangerouslySetMembers failed: ${result.error}`);
      }
      expect(result.value.addedUsers.map((u) => u.sId)).toEqual([
        addedUser.sId,
      ]);
      expect(result.value.removedUsers.map((u) => u.sId)).toEqual([user.sId]);
    });
  });

  describe("suspendMembers", () => {
    it("suspends active members and returns affected user IDs", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Suspend Test Group",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });
      await regularGroup.dangerouslyAddMembers(authenticator, {
        users: [user.toJSON()],
      });

      const membership = await GroupMembershipModel.findOne({
        where: {
          groupId: regularGroup.id,
          userId: user.id,
          workspaceId: workspace.id,
        },
      });
      expect(membership?.status).toBe("active");

      const affectedUserIds = await regularGroup.suspendMembers(authenticator);

      expect(affectedUserIds).toContain(user.id);

      const updatedMembership = await GroupMembershipModel.findOne({
        where: {
          groupId: regularGroup.id,
          userId: user.id,
          workspaceId: workspace.id,
        },
      });
      expect(updatedMembership?.status).toBe("suspended");
    });

    it("invalidates cache for all affected users", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Cache Invalidation Test",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });
      await regularGroup.dangerouslyAddMembers(authenticator, {
        users: [user.toJSON()],
      });

      await GroupResource.dangerouslyListUserGroupsForAuth({ user, workspace });
      const cacheKey = getCacheKeyForUser(user.id, workspace.id);
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      await regularGroup.suspendMembers(authenticator);

      expect(inMemoryCache.has(cacheKey)).toBe(false);
    });
  });

  describe("restoreMembers", () => {
    it("restores suspended members and returns affected user IDs", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Restore Test Group",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });
      await regularGroup.dangerouslyAddMembers(authenticator, {
        users: [user.toJSON()],
      });

      await regularGroup.suspendMembers(authenticator);
      const suspendedMembership = await GroupMembershipModel.findOne({
        where: {
          groupId: regularGroup.id,
          userId: user.id,
          workspaceId: workspace.id,
        },
      });
      expect(suspendedMembership?.status).toBe("suspended");

      const affectedUserIds = await regularGroup.restoreMembers(authenticator);

      expect(affectedUserIds).toContain(user.id);

      const restoredMembership = await GroupMembershipModel.findOne({
        where: {
          groupId: regularGroup.id,
          userId: user.id,
          workspaceId: workspace.id,
        },
      });
      expect(restoredMembership?.status).toBe("active");
    });

    it("invalidates cache for all affected users", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Restore Cache Test",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });
      await regularGroup.dangerouslyAddMembers(authenticator, {
        users: [user.toJSON()],
      });

      await regularGroup.suspendMembers(authenticator);

      await GroupResource.dangerouslyListUserGroupsForAuth({ user, workspace });
      const cacheKey = getCacheKeyForUser(user.id, workspace.id);
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      await regularGroup.restoreMembers(authenticator);

      expect(inMemoryCache.has(cacheKey)).toBe(false);
    });
  });

  describe("migrateUserMemberships", () => {
    it("migrates memberships from secondary to primary user", async () => {
      const secondaryUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, secondaryUser, {
        role: "user",
      });

      const regularGroup = await GroupResource.makeNew({
        name: "Migration Test Group",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });
      await regularGroup.dangerouslyAddMembers(authenticator, {
        users: [secondaryUser.toJSON()],
      });

      const membershipBefore = await GroupMembershipModel.findOne({
        where: {
          groupId: regularGroup.id,
          userId: secondaryUser.id,
          workspaceId: workspace.id,
        },
      });
      expect(membershipBefore).not.toBeNull();

      await GroupResource.migrateUserMemberships(authenticator, {
        primaryUser: user,
        secondaryUser: secondaryUser,
      });

      const membershipAfter = await GroupMembershipModel.findOne({
        where: {
          groupId: regularGroup.id,
          userId: user.id,
          workspaceId: workspace.id,
        },
      });
      expect(membershipAfter).not.toBeNull();

      const secondaryMembershipAfter = await GroupMembershipModel.findOne({
        where: {
          groupId: regularGroup.id,
          userId: secondaryUser.id,
          workspaceId: workspace.id,
        },
      });
      expect(secondaryMembershipAfter).toBeNull();
    });

    it("handles duplicate memberships by removing from secondary user first", async () => {
      const secondaryUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, secondaryUser, {
        role: "user",
      });

      const regularGroup = await GroupResource.makeNew({
        name: "Duplicate Migration Test",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });

      await regularGroup.dangerouslyAddMembers(authenticator, {
        users: [user.toJSON()],
      });
      await regularGroup.dangerouslyAddMembers(authenticator, {
        users: [secondaryUser.toJSON()],
      });

      await GroupResource.migrateUserMemberships(authenticator, {
        primaryUser: user,
        secondaryUser: secondaryUser,
      });

      const primaryMembership = await GroupMembershipModel.findOne({
        where: {
          groupId: regularGroup.id,
          userId: user.id,
          workspaceId: workspace.id,
        },
      });
      expect(primaryMembership).not.toBeNull();

      const secondaryMembership = await GroupMembershipModel.findOne({
        where: {
          groupId: regularGroup.id,
          userId: secondaryUser.id,
          workspaceId: workspace.id,
        },
      });
      expect(secondaryMembership).toBeNull();
    });

    it("invalidates cache for both users", async () => {
      const secondaryUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, secondaryUser, {
        role: "user",
      });

      const regularGroup = await GroupResource.makeNew({
        name: "Cache Migration Test",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });
      await regularGroup.dangerouslyAddMembers(authenticator, {
        users: [secondaryUser.toJSON()],
      });

      // Populate cache for both users
      await GroupResource.dangerouslyListUserGroupsForAuth({ user, workspace });
      await GroupResource.dangerouslyListUserGroupsForAuth({
        user: secondaryUser,
        workspace,
      });

      const primaryCacheKey = getCacheKeyForUser(user.id, workspace.id);
      const secondaryCacheKey = getCacheKeyForUser(
        secondaryUser.id,
        workspace.id
      );
      expect(inMemoryCache.has(primaryCacheKey)).toBe(true);
      expect(inMemoryCache.has(secondaryCacheKey)).toBe(true);

      await GroupResource.migrateUserMemberships(authenticator, {
        primaryUser: user,
        secondaryUser: secondaryUser,
      });

      expect(inMemoryCache.has(primaryCacheKey)).toBe(false);
      expect(inMemoryCache.has(secondaryCacheKey)).toBe(false);
    });
  });

  describe("cache invalidation on membership changes", () => {
    it("dangerouslyAddMembers invalidates cache for added users", async () => {
      await GroupResource.dangerouslyListUserGroupsForAuth({ user, workspace });
      const cacheKey = getCacheKeyForUser(user.id, workspace.id);
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      const regularGroup = await GroupResource.makeNew({
        name: "Add Member Cache Test",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });
      await regularGroup.dangerouslyAddMembers(authenticator, {
        users: [user.toJSON()],
      });

      expect(inMemoryCache.has(cacheKey)).toBe(false);
    });

    it("dangerouslyRemoveMembers invalidates cache for removed users", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Remove Member Cache Test",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });
      await regularGroup.dangerouslyAddMembers(authenticator, {
        users: [user.toJSON()],
      });

      await GroupResource.dangerouslyListUserGroupsForAuth({ user, workspace });
      const cacheKey = getCacheKeyForUser(user.id, workspace.id);
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      await regularGroup.dangerouslyRemoveMembers(authenticator, {
        users: [user.toJSON()],
      });

      expect(inMemoryCache.has(cacheKey)).toBe(false);
    });

    it("delete invalidates cache for all members when group is deleted", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Delete Group Cache Test",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });
      await regularGroup.dangerouslyAddMembers(authenticator, {
        users: [user.toJSON()],
      });

      await GroupResource.dangerouslyListUserGroupsForAuth({ user, workspace });
      const cacheKey = getCacheKeyForUser(user.id, workspace.id);
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      await regularGroup.delete(authenticator);

      expect(inMemoryCache.has(cacheKey)).toBe(false);
    });

    it("makeNew with memberIds invalidates cache for initial members", async () => {
      // Populate cache first
      await GroupResource.dangerouslyListUserGroupsForAuth({ user, workspace });
      const cacheKey = getCacheKeyForUser(user.id, workspace.id);
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      // Create group with initial member
      await GroupResource.makeNew(
        {
          name: "makeNew Initial Member Cache Test",
          workspaceId: workspace.id,
          kind: "regular_auto",
        },
        { memberIds: [user.id] }
      );

      // Cache should be invalidated for the initial member
      expect(inMemoryCache.has(cacheKey)).toBe(false);
    });

    it("defers cache invalidation until after transaction commits", async () => {
      // Populate cache first
      await GroupResource.dangerouslyListUserGroupsForAuth({ user, workspace });
      const cacheKey = getCacheKeyForUser(user.id, workspace.id);
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      // Get the test's transaction from CLS namespace to create a nested transaction
      const namespace = getNamespace("test-namespace");
      const parentTransaction = namespace?.get("transaction");
      expect(parentTransaction).toBeDefined();

      // Create a nested transaction (savepoint) within the test's transaction
      const transaction = await frontSequelize.transaction({
        transaction: parentTransaction,
      });

      try {
        // Create group with member inside transaction
        await GroupResource.makeNew(
          {
            name: "Transaction Cache Test",
            workspaceId: workspace.id,
            kind: "regular_auto",
          },
          { memberIds: [user.id], transaction }
        );

        // Cache should NOT be invalidated yet (transaction not committed)
        expect(inMemoryCache.has(cacheKey)).toBe(true);

        // Commit the nested transaction (releases savepoint and triggers afterCommit)
        await transaction.commit();

        // NOW cache should be invalidated
        expect(inMemoryCache.has(cacheKey)).toBe(false);
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    });
  });

  describe("updatePoolCap", () => {
    it("persists a cap and clears it with null", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Pool Cap Group",
        workspaceId: workspace.id,
        kind: "regular_manual",
      });
      expect(regularGroup.poolCapAwuCredits).toBeNull();

      const setResult = await regularGroup.updatePoolCap(5000);
      expect(setResult.isOk()).toBe(true);

      const afterSet = await GroupResource.fetchById(
        authenticator,
        regularGroup.sId
      );
      if (afterSet.isErr()) {
        throw afterSet.error;
      }
      expect(afterSet.value.poolCapAwuCredits).toBe(5000);

      const clearResult = await regularGroup.updatePoolCap(null);
      expect(clearResult.isOk()).toBe(true);

      const afterClear = await GroupResource.fetchById(
        authenticator,
        regularGroup.sId
      );
      if (afterClear.isErr()) {
        throw afterClear.error;
      }
      expect(afterClear.value.poolCapAwuCredits).toBeNull();
    });
  });

  describe("listMaxPoolCapGroupByUserModelIdInWorkspace", () => {
    it("returns the highest cap across a user's provisioned groups, ignoring uncapped and non-provisioned groups", async () => {
      const user2 = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user2, { role: "user" });

      // Provisioned groups are synced from WorkOS; members are seeded directly.
      const capped500 = await GroupResource.makeNew(
        {
          name: "Capped 500",
          workspaceId: workspace.id,
          kind: "provisioned",
          workOSGroupId: "fake-capped-500",
        },
        { memberIds: [user.id] }
      );
      await capped500.updatePoolCap(500);

      const capped800 = await GroupResource.makeNew(
        {
          name: "Capped 800",
          workspaceId: workspace.id,
          kind: "provisioned",
          workOSGroupId: "fake-capped-800",
        },
        { memberIds: [user.id] }
      );
      await capped800.updatePoolCap(800);

      // Uncapped group: user2 belongs only here, so they have no group cap.
      await GroupResource.makeNew(
        {
          name: "Uncapped",
          workspaceId: workspace.id,
          kind: "provisioned",
          workOSGroupId: "fake-uncapped",
        },
        { memberIds: [user.id, user2.id] }
      );

      // Regular (Space-backed) groups are not cap-eligible: even with a higher
      // cap, they must not contribute to any member's group cap.
      const regularGroup = await GroupResource.makeNew(
        {
          name: "Regular capped",
          workspaceId: workspace.id,
          kind: "regular_auto",
        },
        { memberIds: [user.id, user2.id] }
      );
      await regularGroup.updatePoolCap(10_000);

      const result =
        await GroupResource.listMaxPoolCapGroupByUserModelIdInWorkspace({
          workspace,
          userModelIds: [user.id, user2.id],
        });

      // user is in both capped provisioned groups → the highest cap wins; the
      // regular group's higher cap is ignored.
      expect(result.get(user.id)).toEqual({
        capAwuCredits: 800,
        groupName: "Capped 800",
        groupId: capped800.id,
      });
      // user2 is only in uncapped/non-eligible groups → absent (falls back to
      // the workspace default).
      expect(result.has(user2.id)).toBe(false);
    });

    it("breaks equal-cap ties deterministically by lowest groupId", async () => {
      const groupA = await GroupResource.makeNew(
        {
          name: "Tie A",
          workspaceId: workspace.id,
          kind: "provisioned",
          workOSGroupId: "fake-tie-a",
        },
        { memberIds: [user.id] }
      );
      await groupA.updatePoolCap(500);

      const groupB = await GroupResource.makeNew(
        {
          name: "Tie B",
          workspaceId: workspace.id,
          kind: "provisioned",
          workOSGroupId: "fake-tie-b",
        },
        { memberIds: [user.id] }
      );
      await groupB.updatePoolCap(500);

      const [lower, higher] = [groupA, groupB].sort((a, b) => a.id - b.id);

      const result =
        await GroupResource.listMaxPoolCapGroupByUserModelIdInWorkspace({
          workspace,
          userModelIds: [user.id],
        });

      expect(result.get(user.id)).toEqual({
        capAwuCredits: 500,
        groupName: lower.name,
        groupId: lower.id,
      });
      expect(result.get(user.id)?.groupId).not.toEqual(higher.id);
    });
  });

  describe("listWorkspaceGroupsFromKey", () => {
    it("system key: populates cache on first call and serves from cache on second", async () => {
      const key = await KeyFactory.system(systemGroup);
      const cacheKey = getCacheKeyForWorkspaceGroupsFromSystemKey(workspace.id);

      expect(inMemoryCache.has(cacheKey)).toBe(false);

      const first = await GroupResource.listWorkspaceGroupsFromKey(key);
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      const second = await GroupResource.listWorkspaceGroupsFromKey(key);
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      expect(first.map((g) => g.id).sort()).toEqual(
        second.map((g) => g.id).sort()
      );
    });

    it("system key: returns groups matching the cached kinds", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Listed Regular Group",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });
      const key = await KeyFactory.system(systemGroup);

      const groups = await GroupResource.listWorkspaceGroupsFromKey(key);
      const ids = groups.map((g) => g.id);

      expect(ids).toContain(globalGroup.id);
      expect(ids).toContain(systemGroup.id);
      expect(ids).toContain(regularGroup.id);
    });

    it("non-system key: does not touch the system-key cache", async () => {
      const key = await KeyFactory.regular(globalGroup);
      const cacheKey = getCacheKeyForWorkspaceGroupsFromSystemKey(workspace.id);

      const groups = await GroupResource.listWorkspaceGroupsFromKey(key);

      expect(inMemoryCache.has(cacheKey)).toBe(false);
      expect(groups.map((g) => g.id)).toEqual([globalGroup.id]);
    });

    it("makeNew invalidates the cache", async () => {
      const key = await KeyFactory.system(systemGroup);
      const cacheKey = getCacheKeyForWorkspaceGroupsFromSystemKey(workspace.id);

      await GroupResource.listWorkspaceGroupsFromKey(key);
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      const newGroup = await GroupResource.makeNew({
        name: "Cache Invalidation Regular",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });

      expect(inMemoryCache.has(cacheKey)).toBe(false);

      const groups = await GroupResource.listWorkspaceGroupsFromKey(key);
      expect(groups.map((g) => g.id)).toContain(newGroup.id);
    });

    it("delete of a group invalidates the cache", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Delete Invalidates System Key Cache",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });
      const key = await KeyFactory.system(systemGroup);
      const cacheKey = getCacheKeyForWorkspaceGroupsFromSystemKey(workspace.id);

      const before = await GroupResource.listWorkspaceGroupsFromKey(key);
      expect(before.map((g) => g.id)).toContain(regularGroup.id);
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      const deleteResult = await regularGroup.delete(authenticator);
      expect(deleteResult.isOk()).toBe(true);

      expect(inMemoryCache.has(cacheKey)).toBe(false);

      const after = await GroupResource.listWorkspaceGroupsFromKey(key);
      expect(after.map((g) => g.id)).not.toContain(regularGroup.id);
    });

    it("updateName does not invalidate the cache", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Name Before",
        workspaceId: workspace.id,
        kind: "regular_auto",
      });
      const key = await KeyFactory.system(systemGroup);
      const cacheKey = getCacheKeyForWorkspaceGroupsFromSystemKey(workspace.id);

      await GroupResource.listWorkspaceGroupsFromKey(key);
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      const updateResult =
        await regularGroup.dangerouslyUpdateName("Name After");
      expect(updateResult.isOk()).toBe(true);

      expect(inMemoryCache.has(cacheKey)).toBe(true);
    });

    it("defers cache invalidation from makeNew until after transaction commits", async () => {
      const key = await KeyFactory.system(systemGroup);
      const cacheKey = getCacheKeyForWorkspaceGroupsFromSystemKey(workspace.id);

      await GroupResource.listWorkspaceGroupsFromKey(key);
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      const namespace = getNamespace("test-namespace");
      const parentTransaction = namespace?.get("transaction");
      expect(parentTransaction).toBeDefined();

      const transaction = await frontSequelize.transaction({
        transaction: parentTransaction,
      });

      try {
        await GroupResource.makeNew(
          {
            name: "Deferred Invalidation Group",
            workspaceId: workspace.id,
            kind: "regular_auto",
          },
          { transaction }
        );

        expect(inMemoryCache.has(cacheKey)).toBe(true);

        await transaction.commit();

        expect(inMemoryCache.has(cacheKey)).toBe(false);
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    });
  });
});
