import type { CacheableFunction, JsonSerializable } from "@app/lib/utils/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

const inMemoryCache = vi.hoisted(() => new Map<string, string>());

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
}));

import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { LightWorkspaceType } from "@app/types/user";

function getCacheKeyForWorkspace(workspaceSid: string): string {
  return `cacheWithRedis-countActiveSeatsInWorkspace-count-active-seats-in-workspace:${workspaceSid}`;
}

describe("MembershipResource", () => {
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
      await MembershipResource.countActiveSeatsInWorkspaceCached(workspace.sId);
      expect(inMemoryCache.has(cacheKey)).toBe(true);
    });

    it("serves from cache on second call", async () => {
      const cacheKey = getCacheKeyForWorkspace(workspace.sId);

      await MembershipResource.countActiveSeatsInWorkspaceCached(workspace.sId);
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      await MembershipResource.countActiveSeatsInWorkspaceCached(workspace.sId);
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
      await MembershipResource.countActiveSeatsInWorkspaceCached(workspace.sId);
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
      await MembershipResource.countActiveSeatsInWorkspaceCached(workspace.sId);
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      await membership.delete(authenticator, {});

      expect(inMemoryCache.has(cacheKey)).toBe(false);
    });
  });

  describe("deleteAllForWorkspace()", () => {
    it("invalidates cache for the workspace", async () => {
      const cacheKey = getCacheKeyForWorkspace(workspace.sId);
      await MembershipResource.countActiveSeatsInWorkspaceCached(workspace.sId);
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      await MembershipResource.deleteAllForWorkspace(authenticator);

      expect(inMemoryCache.has(cacheKey)).toBe(false);
    });
  });

  describe("createMembership()", () => {
    it("invalidates cache when new membership created", async () => {
      const cacheKey = getCacheKeyForWorkspace(workspace.sId);
      await MembershipResource.countActiveSeatsInWorkspaceCached(workspace.sId);
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
      await MembershipResource.countActiveSeatsInWorkspaceCached(workspace.sId);
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
      await MembershipResource.countActiveSeatsInWorkspaceCached(workspace.sId);
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
});
