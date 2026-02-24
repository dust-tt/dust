import type { CacheableFunction, JsonSerializable } from "@app/lib/utils/cache";
import { default as cls } from "cls-hooked";
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
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { UserResource } from "@app/lib/resources/user_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { LightWorkspaceType } from "@app/types/user";

function getCacheKeyForUser(userId: number, workspaceId: number): string {
  // The function name is empty because an anonymous arrow function is passed to cacheWithRedis
  return `cacheWithRedis--groups:user:${userId}:workspace:${workspaceId}`;
}

describe("GroupResource", () => {
  let workspace: LightWorkspaceType;
  let user: UserResource;
  let authenticator: Authenticator;
  let globalGroup: GroupResource;

  beforeEach(async () => {
    const testSetup = await createResourceTest({ role: "admin" });
    workspace = testSetup.workspace;
    user = testSetup.user;
    authenticator = testSetup.authenticator;
    globalGroup = testSetup.globalGroup;
    // Clear cache after setup since Authenticator creation may populate it
    inMemoryCache.clear();
  });

  describe("dangerouslyListUserGroupsForAuth", () => {
    it("returns global group and explicit groups for a workspace member", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Test Group",
        workspaceId: workspace.id,
        kind: "regular",
      });
      await regularGroup.dangerouslyAddMembers(authenticator, {
        users: [user.toJSON()],
      });

      const groupIds = await GroupResource.dangerouslyListUserGroupsForAuth({
        user,
        workspace,
      });

      expect(groupIds.length).toBe(2);
      expect(groupIds).toContain(globalGroup.id);
      expect(groupIds).toContain(regularGroup.id);
    });

    it("returns global group for non-member (no membership check)", async () => {
      const nonMember = await UserFactory.basic();

      const groupIds = await GroupResource.dangerouslyListUserGroupsForAuth({
        user: nonMember,
        workspace,
      });

      expect(groupIds.length).toBe(1);
      expect(groupIds).toContain(globalGroup.id);
    });

    it("throws when global group is missing", async () => {
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

  describe("dangerouslyListUserGroupsForAuth caching", () => {
    it("returns groups for authenticated user", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Auth Test Group",
        workspaceId: workspace.id,
        kind: "regular",
      });
      await regularGroup.dangerouslyAddMembers(authenticator, {
        users: [user.toJSON()],
      });

      const groupIds = await GroupResource.dangerouslyListUserGroupsForAuth({
        user,
        workspace,
      });

      expect(groupIds.length).toBe(2);
      expect(groupIds).toContain(globalGroup.id);
      expect(groupIds).toContain(regularGroup.id);
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

  describe("suspendMembers", () => {
    it("suspends active members and returns affected user IDs", async () => {
      const regularGroup = await GroupResource.makeNew({
        name: "Suspend Test Group",
        workspaceId: workspace.id,
        kind: "regular",
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
        kind: "regular",
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
        kind: "regular",
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
        kind: "regular",
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
        kind: "regular",
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
        kind: "regular",
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
        kind: "regular",
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
        kind: "regular",
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
        kind: "regular",
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
        kind: "regular",
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
          kind: "regular",
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
      const namespace = cls.getNamespace("test-namespace");
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
            kind: "regular",
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
});
