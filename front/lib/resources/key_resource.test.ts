import type { CacheableFunction, JsonSerializable } from "@app/lib/utils/cache";
import type { Result } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory cache that replaces the global no-op mock, so we can
// actually assert on cache hits and invalidation.
const inMemoryCache = vi.hoisted(() => new Map<string, string>());

vi.mock("@app/lib/utils/cache", () => ({
  buildCacheWithRedisKey: (cacheId: string, resolverKey: string) =>
    `cacheWithRedis-${cacheId}-${resolverKey}`,
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
  cacheWithRedisResult: vi
    .fn()
    .mockImplementation(
      <T, E, Args extends unknown[]>(
        fn: (...args: Args) => Promise<Result<JsonSerializable<T>, E>>
      ) => {
        return async (
          ...args: Args
        ): Promise<Result<JsonSerializable<T>, E>> => {
          return fn(...args);
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
  invalidateCacheAfterCommit: vi
    .fn()
    .mockImplementation(
      (_transaction: unknown, invalidateFn: () => Promise<void>): void => {
        void invalidateFn();
      }
    ),
}));

import type { Authenticator } from "@app/lib/auth";
import type { GroupResource } from "@app/lib/resources/group_resource";
import {
  KeyResource,
  MARK_AS_USED_MIN_INTERVAL_MS,
} from "@app/lib/resources/key_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { LightWorkspaceType } from "@app/types/user";

function toCacheKey(secret: string): string {
  return `cacheWithRedis-_fetchBySecretUncached-${KeyResource.keyCacheKeyResolver(secret)}`;
}

describe("KeyResource", () => {
  let authenticator: Authenticator;
  let globalGroup: GroupResource;
  let workspace: LightWorkspaceType;

  beforeEach(async () => {
    inMemoryCache.clear();
    const testSetup = await createResourceTest({ role: "admin" });
    authenticator = testSetup.authenticator;
    globalGroup = testSetup.globalGroup;
    workspace = testSetup.workspace;
  });

  describe("fetchBySecret", () => {
    it("returns the key matching the secret", async () => {
      const key = await KeyFactory.regular(globalGroup);

      const fetched = await KeyResource.fetchBySecret(key.secret);

      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(key.id);
      expect(fetched!.name).toBe(key.name);
      expect(fetched!.workspaceId).toBe(key.workspaceId);
    });

    it("returns null for an unknown secret", async () => {
      const fetched = await KeyResource.fetchBySecret("sk-nonexistent");

      expect(fetched).toBeNull();
    });

    it("returns correct fields from cached data", async () => {
      const key = await KeyFactory.regular(globalGroup);

      const fetched = await KeyResource.fetchBySecret(key.secret);

      expect(fetched).not.toBeNull();
      expect(fetched!.status).toBe("active");
      expect(fetched!.isSystem).toBe(false);
      expect(fetched!.role).toBe("builder");
      expect(fetched!.groupIds).toEqual([globalGroup.id]);
      expect(fetched!.secret).toBe(key.secret);
    });

    it("serves from cache on second call", async () => {
      const key = await KeyFactory.regular(globalGroup);
      const cacheKey = toCacheKey(key.secret);

      expect(inMemoryCache.has(cacheKey)).toBe(false);
      await KeyResource.fetchBySecret(key.secret); // miss → populates cache
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      await KeyResource.fetchBySecret(key.secret); // hit → served from cache
      expect(inMemoryCache.has(cacheKey)).toBe(true);
    });
  });

  describe("setIsDisabled", () => {
    it("invalidates cache so next fetch sees the new status", async () => {
      const key = await KeyFactory.regular(globalGroup);
      await KeyResource.fetchBySecret(key.secret); // populate cache

      await key.setIsDisabled();

      const fetched = await KeyResource.fetchBySecret(key.secret);
      expect(fetched).not.toBeNull();
      expect(fetched!.status).toBe("disabled");
    });
  });

  describe("rotateSecret", () => {
    it("invalidates cache for old secret", async () => {
      const key = await KeyFactory.regular(globalGroup);
      const oldSecret = key.secret;
      await KeyResource.fetchBySecret(oldSecret); // populate cache

      await key.rotateSecret({ dangerouslyRotateSecret: true });

      const fetchedOld = await KeyResource.fetchBySecret(oldSecret);
      expect(fetchedOld).toBeNull();

      const fetchedNew = await KeyResource.fetchBySecret(key.secret);
      expect(fetchedNew).not.toBeNull();
      expect(fetchedNew!.id).toBe(key.id);
    });
  });

  describe("updateRole", () => {
    it("invalidates cache so next fetch sees the new role", async () => {
      const key = await KeyFactory.regular(globalGroup);
      await KeyResource.fetchBySecret(key.secret); // populate cache

      await key.updateRole({ newRole: "admin" });

      const fetched = await KeyResource.fetchBySecret(key.secret);
      expect(fetched).not.toBeNull();
      expect(fetched!.role).toBe("admin");
    });
  });

  describe("setGroupMembership", () => {
    it("is idempotent when adding a group the key already has", async () => {
      const key = await KeyFactory.regular(globalGroup);

      await key.setGroupMembership({ group: globalGroup, isMember: true });

      const fetched = await KeyResource.fetchByWorkspaceAndId({
        workspace,
        id: key.id,
      });
      expect(fetched!.groupIds).toEqual([globalGroup.id]);
    });

    it("is idempotent when removing a group the key doesn't have", async () => {
      const key = await KeyFactory.regular(globalGroup);
      const otherGroup = await GroupFactory.regularAuto(
        workspace,
        "other-group"
      );

      await key.setGroupMembership({ group: otherGroup, isMember: false });

      const fetched = await KeyResource.fetchByWorkspaceAndId({
        workspace,
        id: key.id,
      });
      expect(fetched!.groupIds).toEqual([globalGroup.id]);
    });
  });

  describe("updateMonthlyCap", () => {
    it("invalidates cache so next fetch sees the new cap", async () => {
      const key = await KeyFactory.regular(globalGroup);
      await KeyResource.fetchBySecret(key.secret); // populate cache

      await key.updateMonthlyCap({ monthlyCapMicroUsd: 500_000 });

      const fetched = await KeyResource.fetchBySecret(key.secret);
      expect(fetched).not.toBeNull();
      expect(fetched!.monthlyCapMicroUsd).toBe(500_000);
    });
  });

  describe("toJSONWithSpaces", () => {
    it("returns the spaces the key's groups grant access to", async () => {
      const space = await SpaceFactory.regular(
        authenticator.getNonNullableWorkspace()
      );
      const spaceGroups = await SpaceResource.listRegularAutoGroupsForSpaces(
        authenticator,
        [space]
      );
      const key = await KeyFactory.regular([globalGroup, ...spaceGroups]);

      const [json] = await KeyResource.toJSONWithSpaces(
        authenticator,
        [key],
        authenticator.getNonNullableUser().id
      );

      expect(json.spaces.map((s) => s.sId)).toEqual([space.sId]);
    });

    it("lists a space once when several of the key's groups grant on it", async () => {
      // A pod has both a member and an editor group, each with its own grant on the space, so an
      // admin key scoped to it carries two groups pointing at the same space.
      const pod = await SpaceFactory.project(
        authenticator.getNonNullableWorkspace()
      );
      const podGroups = await SpaceResource.listRegularAutoGroupsForSpaces(
        authenticator,
        [pod]
      );
      expect(podGroups).toHaveLength(2);

      const key = await KeyFactory.regular([globalGroup, ...podGroups]);

      const [json] = await KeyResource.toJSONWithSpaces(
        authenticator,
        [key],
        authenticator.getNonNullableUser().id
      );

      expect(json.spaces.map((s) => s.sId)).toEqual([pod.sId]);
    });

    it("ignores the workspace global group", async () => {
      // Every key carries the global group, which reads every open space: mapping it would list
      // most of the workspace on every key.
      await SpaceFactory.regular(authenticator.getNonNullableWorkspace());
      const key = await KeyFactory.regular(globalGroup);

      const [json] = await KeyResource.toJSONWithSpaces(
        authenticator,
        [key],
        authenticator.getNonNullableUser().id
      );

      expect(json.spaces).toEqual([]);
    });
  });

  describe("deleteAllForWorkspace", () => {
    it("invalidates cache for all deleted keys", async () => {
      const key1 = await KeyFactory.regular(globalGroup);
      const key2 = await KeyFactory.regular(globalGroup);
      await KeyResource.fetchBySecret(key1.secret); // populate cache
      await KeyResource.fetchBySecret(key2.secret); // populate cache

      await KeyResource.deleteAllForWorkspace(authenticator);

      const fetched1 = await KeyResource.fetchBySecret(key1.secret);
      const fetched2 = await KeyResource.fetchBySecret(key2.secret);
      expect(fetched1).toBeNull();
      expect(fetched2).toBeNull();
    });
  });
});

describe("KeyResource.createNewSecret", () => {
  it("returns a string starting with 'sk-'", () => {
    const secret = KeyResource.createNewSecret();
    expect(secret.startsWith("sk-")).toBe(true);
  });

  it("returns a 32-character lowercase hex string after the prefix", () => {
    // blake3 produces 32 bytes (256 bits); we keep the first 32 hex chars.
    const secret = KeyResource.createNewSecret();
    const hash = secret.slice("sk-".length);
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it("generates unique secrets on each call", () => {
    const secret1 = KeyResource.createNewSecret();
    const secret2 = KeyResource.createNewSecret();
    expect(secret1).not.toBe(secret2);
  });
});

describe("KeyResource.keyCacheKeyResolver", () => {
  it("returns a key:secret: prefixed 64-char hex blake3 hash", () => {
    const cacheKey = KeyResource.keyCacheKeyResolver("some-api-secret");
    expect(cacheKey).toMatch(/^key:secret:[a-f0-9]{64}$/);
  });

  it("is deterministic for the same secret", () => {
    const secret = "deterministic-secret";
    expect(KeyResource.keyCacheKeyResolver(secret)).toBe(
      KeyResource.keyCacheKeyResolver(secret)
    );
  });

  it("returns different keys for different secrets", () => {
    expect(KeyResource.keyCacheKeyResolver("secret-a")).not.toBe(
      KeyResource.keyCacheKeyResolver("secret-b")
    );
  });

  it("returns a stable value", () => {
    expect(KeyResource.keyCacheKeyResolver("secret-a")).toBe(
      "key:secret:6d0bd572a4f30536d6ad11b514678cb41703fdef30d395f4ecb207a6d2bd2fd3"
    );
  });
});

describe("KeyResource.markAsUsed", () => {
  let globalGroup: GroupResource;

  beforeEach(async () => {
    inMemoryCache.clear();
    const testSetup = await createResourceTest({ role: "admin" });
    globalGroup = testSetup.globalGroup;
  });

  it("writes lastUsedAt when it has never been set", async () => {
    const key = await KeyFactory.regular(globalGroup);
    expect(key.lastUsedAt).toBeNull();

    await key.markAsUsed();

    expect(key.lastUsedAt).not.toBeNull();
  });

  it("skips the DB write when lastUsedAt is within the throttle window", async () => {
    const key = await KeyFactory.regular(globalGroup);
    await key.markAsUsed();
    const firstLastUsedAt = key.lastUsedAt;

    const updateSpy = vi.spyOn(KeyModel, "update");
    await key.markAsUsed();

    expect(updateSpy).not.toHaveBeenCalled();
    expect(key.lastUsedAt).toEqual(firstLastUsedAt);
    updateSpy.mockRestore();
  });

  it("writes again when lastUsedAt is older than the throttle window", async () => {
    const key = await KeyFactory.regular(globalGroup);
    const staleDate = new Date(Date.now() - MARK_AS_USED_MIN_INTERVAL_MS - 1);
    await KeyModel.update(
      { lastUsedAt: staleDate },
      { where: { id: key.id, workspaceId: key.workspaceId } }
    );

    const reloaded = await KeyResource.fetchBySecret(key.secret);
    expect(reloaded).not.toBeNull();

    await reloaded!.markAsUsed();

    expect(reloaded!.lastUsedAt).not.toBeNull();
    expect(reloaded!.lastUsedAt!.getTime()).toBeGreaterThan(
      staleDate.getTime()
    );
  });

  it("invalidates the secret cache so subsequent fetches see the new lastUsedAt", async () => {
    const key = await KeyFactory.regular(globalGroup);
    await KeyResource.fetchBySecret(key.secret); // populate cache with null lastUsedAt

    await key.markAsUsed();

    const fetched = await KeyResource.fetchBySecret(key.secret);
    expect(fetched?.lastUsedAt).not.toBeNull();

    const updateSpy = vi.spyOn(KeyModel, "update");
    await fetched!.markAsUsed();
    expect(updateSpy).not.toHaveBeenCalled();
    updateSpy.mockRestore();
  });
});
