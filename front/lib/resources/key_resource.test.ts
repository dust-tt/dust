import type { CacheableFunction, JsonSerializable } from "@app/lib/utils/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory cache that replaces the global no-op mock, so we can
// actually assert on cache hits and invalidation.
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
        // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
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
        // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
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
import type { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { hash as blake3 } from "blake3";

function getCacheKeyForSecret(secret: string): string {
  const resolvedKey = `key:secret:${Buffer.from(blake3(secret)).toString("hex")}`;
  return `cacheWithRedis-_fetchBySecretUncached-${resolvedKey}`;
}

describe("KeyResource", () => {
  let authenticator: Authenticator;
  let globalGroup: GroupResource;

  beforeEach(async () => {
    inMemoryCache.clear();
    const testSetup = await createResourceTest({ role: "admin" });
    authenticator = testSetup.authenticator;
    globalGroup = testSetup.globalGroup;
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
      expect(fetched!.scope).toBe("default");
      expect(fetched!.groupId).toBe(globalGroup.id);
      expect(fetched!.secret).toBe(key.secret);
    });

    it("serves from cache on second call", async () => {
      const key = await KeyFactory.regular(globalGroup);
      const cacheKey = getCacheKeyForSecret(key.secret);

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
