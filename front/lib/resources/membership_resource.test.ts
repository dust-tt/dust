import type { CacheableFunction, JsonSerializable } from "@app/lib/utils/cache";
import type { Transaction } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

const inMemoryCache = vi.hoisted(() => new Map<string, string>());
const deletedKeys = vi.hoisted(() => [] as string[]);

vi.mock("@app/lib/utils/cache", () => ({
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
          deletedKeys.push(key);
        };
      }
    ),
  bestEffortInvalidateCacheWithRedis: vi
    .fn()
    .mockImplementation(
      <T, Args extends unknown[]>(
        fn: CacheableFunction<JsonSerializable<T>, Args>,
        resolver: (...args: Args) => string
      ) => {
        return async (...args: Args): Promise<void> => {
          const key = `cacheWithRedis-${fn.name}-${resolver(...args)}`;
          inMemoryCache.delete(key);
          deletedKeys.push(key);
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
            deletedKeys.push(key);
          }
        };
      }
    ),
  invalidateCacheAfterCommit: vi
    .fn()
    .mockImplementation(
      (_transaction: unknown, invalidateFn: () => Promise<void>): void => {
        void invalidateFn();
      }
    ),
}));

import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { LightWorkspaceType, WorkspaceType } from "@app/types/user";

function getCacheKeyForWorkspace(workspaceId: string): string {
  return `cacheWithRedis-_countActiveSeatsInWorkspaceUncached-count-active-seats-in-workspace:${workspaceId}`;
}

describe("MembershipResource", () => {
  describe("caching behavior", () => {
    let authenticator: Authenticator;
    let workspace: LightWorkspaceType;

    beforeEach(async () => {
      inMemoryCache.clear();
      const testSetup = await createResourceTest({ role: "admin" });
      authenticator = testSetup.authenticator;
      workspace = testSetup.workspace;
    });

    describe("countActiveSeatsInWorkspaceCached", () => {
      it("caches the seat count on first call", async () => {
        const cacheKey = getCacheKeyForWorkspace(workspace.sId);

        expect(inMemoryCache.has(cacheKey)).toBe(false);
        await MembershipResource.countActiveSeatsInWorkspace(workspace.sId);
        expect(inMemoryCache.has(cacheKey)).toBe(true);
      });

      it("serves from cache on second call", async () => {
        const cacheKey = getCacheKeyForWorkspace(workspace.sId);

        await MembershipResource.countActiveSeatsInWorkspace(workspace.sId);
        expect(inMemoryCache.has(cacheKey)).toBe(true);

        await MembershipResource.countActiveSeatsInWorkspace(workspace.sId);
        expect(inMemoryCache.has(cacheKey)).toBe(true);
      });
    });

    describe("markFirstUse (instance update)", () => {
      it("invalidates cache after update", async () => {
        const user = await UserFactory.basic();
        const membership = await MembershipFactory.associate(workspace, user, {
          role: "user",
          origin: "provisioned",
        });

        const cacheKey = getCacheKeyForWorkspace(workspace.sId);
        await MembershipResource.countActiveSeatsInWorkspace(workspace.sId);
        expect(inMemoryCache.has(cacheKey)).toBe(true);

        await membership.markFirstUse();

        expect(inMemoryCache.has(cacheKey)).toBe(false);
      });
    });

    describe("delete()", () => {
      it("invalidates cache after deletion", async () => {
        const user = await UserFactory.basic();
        const membership = await MembershipFactory.associate(workspace, user, {
          role: "user",
        });

        const cacheKey = getCacheKeyForWorkspace(workspace.sId);
        await MembershipResource.countActiveSeatsInWorkspace(workspace.sId);
        expect(inMemoryCache.has(cacheKey)).toBe(true);

        await membership.delete(authenticator, {});

        expect(inMemoryCache.has(cacheKey)).toBe(false);
      });
    });

    describe("deleteAllForWorkspace()", () => {
      it("invalidates cache for the workspace", async () => {
        const cacheKey = getCacheKeyForWorkspace(workspace.sId);
        await MembershipResource.countActiveSeatsInWorkspace(workspace.sId);
        expect(inMemoryCache.has(cacheKey)).toBe(true);

        await MembershipResource.deleteAllForWorkspace(authenticator);

        expect(inMemoryCache.has(cacheKey)).toBe(false);
      });
    });

    describe("createMembership()", () => {
      it("invalidates cache when new membership created", async () => {
        const cacheKey = getCacheKeyForWorkspace(workspace.sId);
        await MembershipResource.countActiveSeatsInWorkspace(workspace.sId);
        expect(inMemoryCache.has(cacheKey)).toBe(true);

        const newUser = await UserFactory.basic();
        await MembershipResource.createMembership({
          user: newUser,
          workspace,
          role: "user",
        });

        expect(inMemoryCache.has(cacheKey)).toBe(false);
      });
    });

    describe("revokeMembership()", () => {
      it("invalidates cache when membership revoked", async () => {
        const user = await UserFactory.basic();
        await MembershipFactory.associate(workspace, user, {
          role: "user",
        });

        const cacheKey = getCacheKeyForWorkspace(workspace.sId);
        await MembershipResource.countActiveSeatsInWorkspace(workspace.sId);
        expect(inMemoryCache.has(cacheKey)).toBe(true);

        await MembershipResource.revokeMembership({
          user,
          workspace,
        });

        expect(inMemoryCache.has(cacheKey)).toBe(false);
      });
    });

    describe("updateMembershipRole()", () => {
      it("invalidates cache when role updated", async () => {
        const user = await UserFactory.basic();
        await MembershipFactory.associate(workspace, user, {
          role: "user",
        });

        const cacheKey = getCacheKeyForWorkspace(workspace.sId);
        await MembershipResource.countActiveSeatsInWorkspace(workspace.sId);
        expect(inMemoryCache.has(cacheKey)).toBe(true);

        await MembershipResource.updateMembershipRole({
          user,
          workspace,
          newRole: "builder",
          author: "no-author",
        });

        expect(inMemoryCache.has(cacheKey)).toBe(false);
      });
    });

    describe("getActiveSeatTypeForUserModelId()", () => {
      it("returns the active seat type", async () => {
        const user = await UserFactory.basic();
        await MembershipFactory.associate(workspace, user, {
          role: "user",
          seatType: "free",
        });

        const seatType =
          await MembershipResource.getActiveSeatTypeForUserModelId({
            workspace,
            userModelId: user.id,
          });

        expect(seatType).toBe("free");
      });

      it("returns null when the user has no active membership", async () => {
        const user = await UserFactory.basic();

        const seatType =
          await MembershipResource.getActiveSeatTypeForUserModelId({
            workspace,
            userModelId: user.id,
          });

        expect(seatType).toBeNull();
      });
    });
  });

  describe("firstUsedAt behavior", () => {
    let workspace: WorkspaceType;
    let lightWorkspace: LightWorkspaceType;

    beforeEach(async () => {
      workspace = await WorkspaceFactory.basic();
      lightWorkspace = renderLightWorkspaceType({ workspace });
    });

    describe("createMembership origin-based activation", () => {
      it("should activate immediately for 'invited' origin", async () => {
        const user = await UserFactory.withoutLastLogin();
        const beforeCreate = new Date();

        const membership = await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
          origin: "invited",
        });

        expect(membership.firstUsedAt).not.toBeNull();
        expect(membership.firstUsedAt?.getTime()).toBeGreaterThanOrEqual(
          beforeCreate.getTime()
        );
      });

      it("should activate immediately for 'auto-joined' origin", async () => {
        const user = await UserFactory.withoutLastLogin();
        const beforeCreate = new Date();

        const membership = await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
          origin: "auto-joined",
        });

        expect(membership.firstUsedAt).not.toBeNull();
        expect(membership.firstUsedAt?.getTime()).toBeGreaterThanOrEqual(
          beforeCreate.getTime()
        );
      });

      it("should NOT activate for 'provisioned' origin", async () => {
        const user = await UserFactory.withoutLastLogin();

        const membership = await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
          origin: "provisioned",
        });

        expect(membership.firstUsedAt).toBeNull();
      });

      it("should default to 'invited' origin when not specified", async () => {
        const user = await UserFactory.withoutLastLogin();

        const membership = await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
        });

        expect(membership.origin).toBe("invited");
        expect(membership.firstUsedAt).not.toBeNull();
      });
    });

    describe("markFirstUse", () => {
      it("should activate provisioned membership when accessing workspace", async () => {
        const user = await UserFactory.withoutLastLogin();

        const membership = await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
          origin: "provisioned",
        });

        const beforeActivation = new Date();
        const activated = await membership.markFirstUse();

        expect(activated).toBe(true);

        const updatedMembership =
          await MembershipResource.getActiveMembershipOfUserInWorkspace({
            user,
            workspace: lightWorkspace,
          });

        expect(updatedMembership?.firstUsedAt).not.toBeNull();
        expect(
          updatedMembership?.firstUsedAt?.getTime()
        ).toBeGreaterThanOrEqual(beforeActivation.getTime());
      });

      it("should NOT re-activate already activated membership", async () => {
        const user = await UserFactory.withoutLastLogin();

        const membership = await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
          origin: "invited",
        });

        const originalActivatedAt = membership.firstUsedAt;
        expect(originalActivatedAt).not.toBeNull();

        const activated = await membership.markFirstUse();

        expect(activated).toBe(false);

        const updatedMembership =
          await MembershipResource.getActiveMembershipOfUserInWorkspace({
            user,
            workspace: lightWorkspace,
          });

        expect(updatedMembership?.firstUsedAt?.getTime()).toBe(
          originalActivatedAt?.getTime()
        );
      });

      it("should return false if already activated", async () => {
        const user = await UserFactory.withoutLastLogin();

        const membership = await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
          origin: "invited",
        });

        const activated = await membership.markFirstUse();

        expect(activated).toBe(false);
      });

      it("should activate provisioned membership", async () => {
        const user = await UserFactory.withoutLastLogin();

        const membership = await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
          origin: "provisioned",
        });

        expect(membership.firstUsedAt).toBeNull();

        const activated = await membership.markFirstUse();

        expect(activated).toBe(true);

        const updatedMembership =
          await MembershipResource.getActiveMembershipOfUserInWorkspace({
            user,
            workspace: lightWorkspace,
          });

        expect(updatedMembership?.firstUsedAt).not.toBeNull();
      });
    });

    describe("getMembersCountForWorkspace", () => {
      it("should count only activated members when activeOnly is true", async () => {
        const activatedUser = await UserFactory.withoutLastLogin();
        const provisionedUser = await UserFactory.withoutLastLogin();

        await MembershipResource.createMembership({
          user: activatedUser,
          workspace: lightWorkspace,
          role: "user",
          origin: "invited",
        });

        await MembershipResource.createMembership({
          user: provisionedUser,
          workspace: lightWorkspace,
          role: "user",
          origin: "provisioned",
        });

        const count = await MembershipResource.getMembersCountForWorkspace({
          workspace: lightWorkspace,
          activeOnly: true,
        });

        expect(count).toBe(1);
      });

      it("should count all members regardless of activation when activeOnly is false", async () => {
        const invitedUser = await UserFactory.withoutLastLogin();
        const provisionedUser = await UserFactory.withoutLastLogin();

        await MembershipResource.createMembership({
          user: invitedUser,
          workspace: lightWorkspace,
          role: "user",
          origin: "invited",
        });

        await MembershipResource.createMembership({
          user: provisionedUser,
          workspace: lightWorkspace,
          role: "user",
          origin: "provisioned",
        });

        const count = await MembershipResource.getMembersCountForWorkspace({
          workspace: lightWorkspace,
          activeOnly: false,
        });

        expect(count).toBe(2);
      });

      it("should not count revoked memberships even if activated", async () => {
        const user = await UserFactory.withoutLastLogin();

        await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
          origin: "invited",
        });

        await MembershipResource.revokeMembership({
          user,
          workspace: lightWorkspace,
        });

        const count = await MembershipResource.getMembersCountForWorkspace({
          workspace: lightWorkspace,
          activeOnly: true,
        });

        expect(count).toBe(0);
      });
    });
  });

  describe("caching behavior", () => {
    let workspace: WorkspaceType;
    let lightWorkspace: LightWorkspaceType;

    beforeEach(async () => {
      workspace = await WorkspaceFactory.basic();
      lightWorkspace = renderLightWorkspaceType({ workspace });
    });

    describe("getActiveRoleForUserInWorkspace", () => {
      it("should call cached function for role lookup", async () => {
        const user = await UserFactory.withoutLastLogin();
        await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
        });

        const role = await MembershipResource.getActiveRoleForUserInWorkspace({
          user,
          workspace: lightWorkspace,
        });

        expect(role).toBe("user");
      });

      it("should return correct role when membership role is updated", async () => {
        const user = await UserFactory.withoutLastLogin();
        await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "builder",
        });

        const role = await MembershipResource.getActiveRoleForUserInWorkspace({
          user,
          workspace: lightWorkspace,
        });

        expect(role).toBe("builder");
      });

      it("should return 'none' when no membership exists", async () => {
        const user = await UserFactory.withoutLastLogin();
        const role = await MembershipResource.getActiveRoleForUserInWorkspace({
          user,
          workspace: lightWorkspace,
        });
        expect(role).toBe("none");
      });
    });

    describe("countActiveSeatsInWorkspace", () => {
      it("should return correct count via cached function", async () => {
        const user = await UserFactory.withoutLastLogin();
        await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
          origin: "invited",
        });

        const count = await MembershipResource.countActiveSeatsInWorkspace(
          workspace.sId
        );

        expect(count).toBe(1);
      });

      it("should return 0 for empty workspace", async () => {
        const count = await MembershipResource.countActiveSeatsInWorkspace(
          workspace.sId
        );
        expect(count).toBe(0);
      });
    });

    describe("cache invalidation", () => {
      beforeEach(() => {
        deletedKeys.length = 0;
      });

      it("should invalidate caches when creating membership", async () => {
        const user = await UserFactory.withoutLastLogin();
        await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
        });

        const roleCacheKey = `cacheWithRedis-_getActiveRoleForUserInWorkspaceUncached-role:user:${user.id}:workspace:${workspace.id}`;
        const seatsCacheKey = `cacheWithRedis-_countActiveSeatsInWorkspaceUncached-count-active-seats-in-workspace:${workspace.sId}`;

        expect(deletedKeys).toContain(roleCacheKey);
        expect(deletedKeys).toContain(seatsCacheKey);
      });

      it("should invalidate caches when revoking membership", async () => {
        const user = await UserFactory.withoutLastLogin();
        await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
        });

        deletedKeys.length = 0;

        await MembershipResource.revokeMembership({
          user,
          workspace: lightWorkspace,
        });

        const roleCacheKey = `cacheWithRedis-_getActiveRoleForUserInWorkspaceUncached-role:user:${user.id}:workspace:${workspace.id}`;
        const seatsCacheKey = `cacheWithRedis-_countActiveSeatsInWorkspaceUncached-count-active-seats-in-workspace:${workspace.sId}`;

        expect(deletedKeys).toContain(roleCacheKey);
        expect(deletedKeys).toContain(seatsCacheKey);
      });

      it("should invalidate seats cache when marking first use", async () => {
        const user = await UserFactory.withoutLastLogin();
        await MembershipResource.createMembership({
          user,
          workspace: lightWorkspace,
          role: "user",
          origin: "provisioned",
        });

        deletedKeys.length = 0;

        const membership =
          await MembershipResource.getActiveMembershipOfUserInWorkspace({
            user,
            workspace: lightWorkspace,
          });
        await membership?.markFirstUse();

        const seatsCacheKey = `cacheWithRedis-_countActiveSeatsInWorkspaceUncached-count-active-seats-in-workspace:${workspace.sId}`;

        expect(deletedKeys).toContain(seatsCacheKey);
      });

      it("should invalidate seats cache when deleting all memberships for workspace", async () => {
        const user = await UserFactory.withoutLastLogin();
        await MembershipFactory.associate(workspace, user, { role: "admin" });

        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );

        deletedKeys.length = 0;

        await MembershipResource.deleteAllForWorkspace(auth);

        const seatsCacheKey = `cacheWithRedis-_countActiveSeatsInWorkspaceUncached-count-active-seats-in-workspace:${workspace.sId}`;

        expect(deletedKeys).toContain(seatsCacheKey);
      });

      it("should invalidate both caches when deleting a single membership", async () => {
        const user = await UserFactory.withoutLastLogin();
        const membership = await MembershipFactory.associate(workspace, user, {
          role: "user",
        });

        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );

        deletedKeys.length = 0;

        await membership.delete(auth, {});

        const roleCacheKey = `cacheWithRedis-_getActiveRoleForUserInWorkspaceUncached-role:user:${user.id}:workspace:${workspace.id}`;
        const seatsCacheKey = `cacheWithRedis-_countActiveSeatsInWorkspaceUncached-count-active-seats-in-workspace:${workspace.sId}`;

        expect(deletedKeys).toContain(roleCacheKey);
        expect(deletedKeys).toContain(seatsCacheKey);
      });
    });
  });

  describe("scheduleSeatChange", () => {
    let workspace: WorkspaceType;
    let lightWorkspace: LightWorkspaceType;
    let outerTransaction: Transaction;
    const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    beforeEach(async (ctx) => {
      // Capture the outer CLS transaction so scheduleSeatChange can use it as
      // a parent (SAVEPOINT). Without this, scheduleSeatChange opens a second
      // DB connection that deadlocks waiting for the lock held by the test
      // isolation transaction on the membership row.
      outerTransaction = (ctx as any)["transaction"] as Transaction;
      workspace = await WorkspaceFactory.basic();
      lightWorkspace = renderLightWorkspaceType({ workspace });
    });

    it("initializes the scheduled row's creditState to user_seat for an allowance seat", async () => {
      const user = await UserFactory.basic();
      await MembershipResource.createMembership({
        user,
        workspace: lightWorkspace,
        role: "user",
        origin: "invited",
        seatType: "workspace",
      });
      const active =
        await MembershipResource.getActiveMembershipOfUserInWorkspace({
          user,
          workspace: lightWorkspace,
        });
      if (!active) {
        throw new Error("Expected an active membership");
      }

      await active.scheduleSeatChange({
        user,
        workspace: lightWorkspace,
        newSeatType: "max",
        scheduledAt,
        author: "no-author",
        transaction: outerTransaction,
      });

      const future = await MembershipResource.getScheduledFutureMemberships({
        workspace: lightWorkspace,
      });
      expect(future).toHaveLength(1);
      expect(future[0].seatType).toBe("max");
      expect(future[0].creditState).toBe("user_seat");
    });

    it("initializes the scheduled row's creditState to on_pool for a pool seat", async () => {
      const user = await UserFactory.basic();
      await MembershipResource.createMembership({
        user,
        workspace: lightWorkspace,
        role: "user",
        origin: "invited",
        seatType: "max",
      });
      const active =
        await MembershipResource.getActiveMembershipOfUserInWorkspace({
          user,
          workspace: lightWorkspace,
        });
      if (!active) {
        throw new Error("Expected an active membership");
      }

      await active.scheduleSeatChange({
        user,
        workspace: lightWorkspace,
        newSeatType: "workspace",
        scheduledAt,
        author: "no-author",
        transaction: outerTransaction,
      });

      const future = await MembershipResource.getScheduledFutureMemberships({
        workspace: lightWorkspace,
      });
      expect(future).toHaveLength(1);
      expect(future[0].seatType).toBe("workspace");
      expect(future[0].creditState).toBe("on_pool");
    });
  });

  describe("resetAllSeatsToNoneForWorkspace", () => {
    let workspace: WorkspaceType;
    let lightWorkspace: LightWorkspaceType;

    beforeEach(async () => {
      workspace = await WorkspaceFactory.basic();
      lightWorkspace = renderLightWorkspaceType({ workspace });
    });

    it("resets every active membership to the none seat type", async () => {
      const userA = await UserFactory.basic();
      const userB = await UserFactory.basic();
      await MembershipFactory.associate(workspace, userA, {
        role: "admin",
        seatType: "workspace",
      });
      await MembershipFactory.associate(workspace, userB, {
        role: "user",
        seatType: "max",
      });

      await MembershipResource.resetAllSeatsToNoneForWorkspace({
        workspace: lightWorkspace,
      });

      const counts =
        await MembershipResource.getActiveSeatTypeCountsForWorkspace({
          workspace: lightWorkspace,
        });
      expect(counts).toEqual({ none: 2 });

      const membershipA =
        await MembershipResource.getActiveMembershipOfUserInWorkspace({
          user: userA,
          workspace: lightWorkspace,
        });
      expect(membershipA?.seatType).toBe("none");
      expect(membershipA?.creditState).toBe("on_pool");
    });

    it("leaves already-ended memberships untouched", async () => {
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, {
        role: "user",
        seatType: "max",
      });
      await MembershipResource.revokeMembership({
        user,
        workspace: lightWorkspace,
      });

      await MembershipResource.resetAllSeatsToNoneForWorkspace({
        workspace: lightWorkspace,
      });

      const ended =
        await MembershipResource.getLatestMembershipOfUserInWorkspace({
          user,
          workspace: lightWorkspace,
        });
      expect(ended?.seatType).toBe("max");
    });

    it("invalidates the active seats cache", async () => {
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, {
        role: "user",
        seatType: "workspace",
      });

      deletedKeys.length = 0;
      await MembershipResource.resetAllSeatsToNoneForWorkspace({
        workspace: lightWorkspace,
      });

      const seatsCacheKey = `cacheWithRedis-_countActiveSeatsInWorkspaceUncached-count-active-seats-in-workspace:${workspace.sId}`;
      expect(deletedKeys).toContain(seatsCacheKey);
    });
  });
});
