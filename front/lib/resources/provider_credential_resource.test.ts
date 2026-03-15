import type { CacheableFunction, JsonSerializable } from "@app/lib/utils/cache";
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
  };
});

const mockGetCredentials = vi.fn();

vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return {
    ...actual,
    OAuthAPI: vi.fn().mockImplementation(function () {
      return {
        getCredentials: mockGetCredentials,
      };
    }),
  };
});

import { ProviderCredentialResource } from "@app/lib/resources/provider_credential_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { ProviderCredentialFactory } from "@app/tests/utils/ProviderCredentialFactory";
import { Ok } from "@app/types/shared/result";

function getCacheKey(workspaceId: number): string {
  return `cacheWithRedis-_baseFetchUncached-provider_credentials:workspaceId:${workspaceId}`;
}

describe("ProviderCredentialResource", () => {
  beforeEach(() => {
    mockGetCredentials.mockResolvedValue(
      new Ok({ credential: { content: { api_key: "sk-test" } } })
    );
    inMemoryCache.clear();
  });

  describe("listByWorkspace", () => {
    it("throws when plan does not have isByok enabled", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      await expect(
        ProviderCredentialResource.listByWorkspace(authenticator)
      ).rejects.toThrow("BYOK must be enabled");
    });

    it("returns empty array when no credentials exist", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });

      const result =
        await ProviderCredentialResource.listByWorkspace(authenticator);

      expect(result).toEqual([]);
    });

    it("returns all credentials for the workspace", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });
      const workspace = authenticator.getNonNullableWorkspace();

      await ProviderCredentialFactory.basic(workspace, "openai");
      await ProviderCredentialFactory.basic(workspace, "anthropic");

      const result =
        await ProviderCredentialResource.listByWorkspace(authenticator);

      expect(result).toHaveLength(2);
      expect(result.map((c) => c.providerId).sort()).toEqual([
        "anthropic",
        "openai",
      ]);
    });
  });

  describe("toJSON", () => {
    it("returns a valid ProviderCredentialType", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });
      const workspace = authenticator.getNonNullableWorkspace();
      await ProviderCredentialFactory.basic(workspace, "openai");

      const result =
        await ProviderCredentialResource.listByWorkspace(authenticator);

      const [credential] = result;
      const json = credential.toJSON();

      expect(json.sId).toMatch(/^pcr_/);
      expect(json.providerId).toBe("openai");
      expect(json.credentialId).toBe("cred-openai");
      expect(json.isHealthy).toBe(true);
      expect(json.placeholder).toBe("sk-...abc");
      expect(json.editedByUserId).toBeNull();
      expect(typeof json.createdAt).toBe("number");
      expect(typeof json.updatedAt).toBe("number");
    });
  });

  describe("delete", () => {
    it("removes the credential", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });
      const workspace = authenticator.getNonNullableWorkspace();

      await ProviderCredentialFactory.basic(workspace, "openai");

      const result =
        await ProviderCredentialResource.listByWorkspace(authenticator);

      const [credential] = result;
      await credential.delete(authenticator);

      const remaining =
        await ProviderCredentialResource.listByWorkspace(authenticator);
      expect(remaining).toHaveLength(0);
    });
  });

  describe("deleteAllForWorkspace", () => {
    it("removes all credentials for the workspace", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });
      const workspace = authenticator.getNonNullableWorkspace();

      await ProviderCredentialFactory.basic(workspace, "openai");
      await ProviderCredentialFactory.basic(workspace, "anthropic");

      await ProviderCredentialResource.deleteAllForWorkspace(authenticator);

      const remaining =
        await ProviderCredentialResource.listByWorkspace(authenticator);
      expect(remaining).toHaveLength(0);
    });
  });

  describe("baseFetch caching", () => {
    it("populates cache on first call", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });
      const workspace = authenticator.getNonNullableWorkspace();
      const cacheKey = getCacheKey(workspace.id);

      expect(inMemoryCache.has(cacheKey)).toBe(false);

      await ProviderCredentialResource.listByWorkspace(authenticator);

      expect(inMemoryCache.has(cacheKey)).toBe(true);
    });

    it("serves from cache on second call", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });
      const workspace = authenticator.getNonNullableWorkspace();

      await ProviderCredentialFactory.basic(workspace, "openai");

      const result1 =
        await ProviderCredentialResource.listByWorkspace(authenticator);
      const result2 =
        await ProviderCredentialResource.listByWorkspace(authenticator);

      expect(result1.map((r) => r.toJSON())).toEqual(
        result2.map((r) => r.toJSON())
      );
      // OAuthAPI should only be called once (for the first fetch)
      expect(mockGetCredentials).toHaveBeenCalledTimes(1);
    });

    it("invalidates cache after delete", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });
      const workspace = authenticator.getNonNullableWorkspace();
      const cacheKey = getCacheKey(workspace.id);

      await ProviderCredentialFactory.basic(workspace, "openai");

      await ProviderCredentialResource.listByWorkspace(authenticator);
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      const [credential] =
        await ProviderCredentialResource.listByWorkspace(authenticator);
      await credential.delete(authenticator);

      expect(inMemoryCache.has(cacheKey)).toBe(false);
    });

    it("invalidates cache after deleteAllForWorkspace", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });
      const workspace = authenticator.getNonNullableWorkspace();
      const cacheKey = getCacheKey(workspace.id);

      await ProviderCredentialFactory.basic(workspace, "openai");

      await ProviderCredentialResource.listByWorkspace(authenticator);
      expect(inMemoryCache.has(cacheKey)).toBe(true);

      await ProviderCredentialResource.deleteAllForWorkspace(authenticator);

      expect(inMemoryCache.has(cacheKey)).toBe(false);
    });

    it("returns fresh data after cache invalidation", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });
      const workspace = authenticator.getNonNullableWorkspace();

      await ProviderCredentialFactory.basic(workspace, "openai");

      const result1 =
        await ProviderCredentialResource.listByWorkspace(authenticator);
      expect(result1).toHaveLength(1);

      // Delete and verify cache is invalidated
      await result1[0].delete(authenticator);

      // Next call should hit DB again and return empty
      const result2 =
        await ProviderCredentialResource.listByWorkspace(authenticator);
      expect(result2).toHaveLength(0);
    });
  });
});
