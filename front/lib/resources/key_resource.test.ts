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
import { KeyResource } from "@app/lib/resources/key_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { KeyFactory } from "@app/tests/utils/KeyFactory";

function toCacheKey(secret: string): string {
  return `cacheWithRedis-_fetchBySecretUncached-${KeyResource.keyCacheKeyResolver(secret)}`;
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
