import { CONVERSATIONS_RETENTION_MIN_DAYS } from "@app/lib/conversations_retention";
import { EMPTY_PLAN_LIMIT_OVERRIDE } from "@app/lib/plans/plan_limit_overrides";
import type { CacheableFunction, JsonSerializable } from "@app/lib/utils/cache";
import { getNamespace } from "@app/tests/utils/test_cls";
import type { Result } from "@app/types/shared/result";
import type { Transaction } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

const inMemoryCache = vi.hoisted(() => new Map<string, string>());
const deletedKeys = vi.hoisted(() => [] as string[]);
const cacheReadFailure = vi.hoisted(() => ({ current: null as Error | null }));

vi.mock("@app/lib/utils/cache", () => ({
  buildCacheWithRedisKey: (cacheId: string, resolverKey: string) =>
    `cacheWithRedis-${cacheId}-${resolverKey}`,
  cacheWithRedis: vi.fn().mockImplementation(
    <T, Args extends unknown[]>(
      fn: CacheableFunction<JsonSerializable<T>, Args>,
      resolver: (...args: Args) => string,
      options?: {
        cacheId?: string;
        cacheNullValues?: boolean;
        migration?: {
          previousKey: {
            cacheId: string;
            resolver: (...args: Args) => string;
          };
          readFrom: "previous" | "new";
          copyToOtherKey: "after_load" | "after_read";
        };
      }
    ) => {
      return async (...args: Args): Promise<JsonSerializable<T>> => {
        if (cacheReadFailure.current) {
          throw cacheReadFailure.current;
        }
        const newKey = `cacheWithRedis-${options?.cacheId ?? fn.name}-${resolver(...args)}`;
        const previousKey = options?.migration
          ? `cacheWithRedis-${options.migration.previousKey.cacheId}-${options.migration.previousKey.resolver(...args)}`
          : null;
        const readKey =
          options?.migration?.readFrom === "previous" && previousKey
            ? previousKey
            : newKey;
        const otherKey = previousKey
          ? readKey === newKey
            ? previousKey
            : newKey
          : null;
        const cached = inMemoryCache.get(readKey);
        if (cached) {
          if (otherKey && options?.migration?.copyToOtherKey === "after_read") {
            inMemoryCache.set(otherKey, cached);
          }
          return JSON.parse(cached) as JsonSerializable<T>;
        }
        const result = await fn(...args);
        if ((options?.cacheNullValues ?? true) || result !== null) {
          const serializedResult = JSON.stringify(result);
          inMemoryCache.set(readKey, serializedResult);
          if (otherKey) {
            inMemoryCache.set(otherKey, serializedResult);
          }
        }
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
  invalidateCacheWithRedis: vi.fn().mockImplementation(
    <T, Args extends unknown[]>(
      fn: CacheableFunction<JsonSerializable<T>, Args>,
      resolver: (...args: Args) => string,
      options?: {
        cacheId?: string;
        migration?: {
          previousKey: {
            cacheId: string;
            resolver: (...args: Args) => string;
          };
        };
      }
    ) => {
      return (...args: Args): Promise<void> => {
        const newKey = `cacheWithRedis-${options?.cacheId ?? fn.name}-${resolver(...args)}`;
        inMemoryCache.delete(newKey);
        deletedKeys.push(newKey);
        if (options?.migration) {
          const previousKey = `cacheWithRedis-${options.migration.previousKey.cacheId}-${options.migration.previousKey.resolver(...args)}`;
          inMemoryCache.delete(previousKey);
          deletedKeys.push(previousKey);
        }
        return Promise.resolve();
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
        return (...args: Args): Promise<void> => {
          const key = `cacheWithRedis-${fn.name}-${resolver(...args)}`;
          inMemoryCache.delete(key);
          deletedKeys.push(key);
          return Promise.resolve();
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

vi.mock("@app/lib/api/workos/organization_primitives", async () => {
  const actual = await vi.importActual(
    "@app/lib/api/workos/organization_primitives"
  );
  return {
    ...actual,
    listWorkOSOrganizationsWithDomain: vi.fn().mockResolvedValue([]),
  };
});

const listEnabledKillSwitches = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("@app/lib/resources/kill_switch_resource", () => ({
  KillSwitchResource: {
    listEnabledKillSwitches,
  },
}));

import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";

function getCacheKeyForWorkspace(workspaceId: string): string {
  return WorkspaceResource.byIdCacheOperations.buildKey({ wId: workspaceId });
}

function getPreviousCacheKeyForWorkspace(workspaceId: string): string {
  return `cacheWithRedis-_fetchByIdUncached-workspace:v2:${workspaceId}`;
}

const INVALID_RETENTION_DAYS = CONVERSATIONS_RETENTION_MIN_DAYS - 1;
const SHORT_RETENTION_DAYS = 30;

describe("WorkspaceResource", () => {
  let workspace: WorkspaceType;

  beforeEach(async () => {
    listEnabledKillSwitches.mockReset().mockResolvedValue([]);
    cacheReadFailure.current = null;
    workspace = await WorkspaceFactory.basic();
  });

  describe("unsafeListWorkspaceIdBatchAfterModelId", () => {
    it("lists workspaces in ascending model id order after the checkpoint", async () => {
      const firstWorkspace = await WorkspaceFactory.basic();
      const secondWorkspace = await WorkspaceFactory.basic();

      await expect(
        WorkspaceResource.unsafeListWorkspaceIdBatchAfterModelId({
          lastWorkspaceModelId: firstWorkspace.id,
          limit: 1,
        })
      ).resolves.toEqual([
        {
          workspaceId: secondWorkspace.sId,
          workspaceModelId: secondWorkspace.id,
        },
      ]);
    });
  });

  describe("caching behavior", () => {
    beforeEach(() => {
      inMemoryCache.clear();
      deletedKeys.length = 0;
    });

    describe("fetchById", () => {
      it("caches the workspace on first call", async () => {
        const workspaceId = workspace.sId;
        const cacheKey = getCacheKeyForWorkspace(workspaceId);
        const previousCacheKey = getPreviousCacheKeyForWorkspace(workspaceId);

        expect(inMemoryCache.has(cacheKey)).toBe(false);
        expect(inMemoryCache.has(previousCacheKey)).toBe(false);
        await WorkspaceResource.fetchById(workspaceId);
        expect(inMemoryCache.has(cacheKey)).toBe(true);
        expect(inMemoryCache.has(previousCacheKey)).toBe(true);
      });

      it("serves from cache on second call", async () => {
        const workspaceId = workspace.sId;
        const cacheKey = getCacheKeyForWorkspace(workspaceId);

        await WorkspaceResource.fetchById(workspaceId);
        expect(inMemoryCache.has(cacheKey)).toBe(true);

        await WorkspaceResource.fetchById(workspaceId);
        expect(inMemoryCache.has(cacheKey)).toBe(true);
      });

      it("bypasses the cache in a transaction", async () => {
        const cacheKey = getCacheKeyForWorkspace(workspace.sId);
        const transaction: Transaction | undefined =
          getNamespace("test-namespace")?.get("transaction");
        if (!transaction) {
          throw new Error("Expected the test transaction to be available.");
        }

        const resource = await WorkspaceResource.fetchById(
          workspace.sId,
          transaction
        );

        expect(resource?.sId).toBe(workspace.sId);
        expect(inMemoryCache.has(cacheKey)).toBe(false);
      });

      it("falls back to the database when the cache is unavailable", async () => {
        cacheReadFailure.current = new Error("Redis unavailable");

        const resource = await WorkspaceResource.fetchById(workspace.sId);

        expect(resource?.sId).toBe(workspace.sId);
      });

      it("keeps the configured whiteListedProviders on cached fetches even when kill switches are enabled", async () => {
        workspace = await WorkspaceFactory.basic({
          whiteListedProviders: ["openai", "anthropic"],
        });
        listEnabledKillSwitches.mockResolvedValue(["global_blacklist_openai"]);

        const firstFetch = await WorkspaceResource.fetchById(workspace.sId);
        expect(firstFetch?.configuredWhiteListedProviders).toEqual([
          "openai",
          "anthropic",
        ]);

        const cachedFetch = await WorkspaceResource.fetchById(workspace.sId);
        expect(cachedFetch?.configuredWhiteListedProviders).toEqual([
          "openai",
          "anthropic",
        ]);
      });

      // A v3 snapshot exactly as the previous deploy wrote it. Guards two things: entries written
      // before a deploy must keep parsing (the cache has no TTL), and the fixture's key set must
      // match the model's attributes. When the keys assertion fails, the model changed shape and
      // WORKSPACE_CACHE_KEY_VERSION must be bumped along with this fixture.
      it("parses snapshots written by the previous deploy", async () => {
        const v3Snapshot = {
          id: 987654321,
          sId: "ws_fixture_v3",
          name: "fixture-workspace",
          description: null,
          segmentation: null,
          ssoEnforced: false,
          regionalModelsOnly: false,
          workOSOrganizationId: null,
          whiteListedProviders: ["openai", "anthropic"],
          defaultEmbeddingProvider: null,
          metadata: { fixtureKey: "fixtureValue" },
          sharingPolicy: "all_scopes",
          conversationsRetentionDays: null,
          metronomeCustomerId: null,
          poolCreditState: "active",
          programmaticCreditState: "active",
          createdAt: 1755000000000,
          updatedAt: 1755000000000,
        };
        inMemoryCache.set(
          getCacheKeyForWorkspace(v3Snapshot.sId),
          JSON.stringify(v3Snapshot)
        );

        const resource = await WorkspaceResource.fetchById(v3Snapshot.sId);

        expect(Object.keys(v3Snapshot).sort()).toEqual(
          Object.keys(WorkspaceModel.getAttributes()).sort()
        );
        expect(resource?.name).toBe("fixture-workspace");
        expect(resource?.configuredWhiteListedProviders).toEqual([
          "openai",
          "anthropic",
        ]);
        expect(resource?.metadata).toEqual({ fixtureKey: "fixtureValue" });
        expect(resource?.createdAt).toEqual(new Date(1755000000000));
        expect(resource?.updatedAt).toEqual(new Date(1755000000000));
      });

      it("serves the same attributes from the cache as from the database", async () => {
        await WorkspaceResource.fetchById(workspace.sId);

        const cachedFetch = await WorkspaceResource.fetchById(workspace.sId);
        const [databaseFetch] = await WorkspaceResource.fetchByIds([
          workspace.sId,
        ]);

        expect(cachedFetch?.blob).toEqual(databaseFetch?.blob);
      });
    });

    describe("makeNew", () => {
      it("invalidates cache after creation", async () => {
        const newWorkspace = await WorkspaceResource.makeNew({
          sId: `ws-new-${Date.now()}`,
          name: "New Workspace",
        });

        const newWorkspaceId = newWorkspace.sId;
        const cacheKey = getCacheKeyForWorkspace(newWorkspaceId);
        expect(deletedKeys).toContain(cacheKey);
      });
    });

    describe("update (via updateWorkspaceSettings)", () => {
      it("invalidates cache when workspace is updated", async () => {
        const workspaceId = workspace.sId;
        const cacheKey = getCacheKeyForWorkspace(workspaceId);

        await WorkspaceResource.fetchById(workspaceId);
        expect(inMemoryCache.has(cacheKey)).toBe(true);

        const resource = await WorkspaceResource.fetchById(workspaceId);
        await resource?.updateWorkspaceSettings({ name: "Updated Name" });

        expect(deletedKeys).toContain(cacheKey);
        expect(deletedKeys).toContain(
          getPreviousCacheKeyForWorkspace(workspaceId)
        );
        expect(inMemoryCache.has(cacheKey)).toBe(false);
      });
    });

    describe("updateMetadata", () => {
      it("invalidates cache when metadata is updated", async () => {
        const workspaceId = workspace.sId;
        const workspaceModelId = workspace.id;
        const cacheKey = getCacheKeyForWorkspace(workspaceId);

        await WorkspaceResource.fetchById(workspaceId);
        expect(inMemoryCache.has(cacheKey)).toBe(true);

        await WorkspaceResource.updateMetadata(workspaceModelId, {
          testKey: "testValue",
        });

        expect(deletedKeys).toContain(cacheKey);
        expect(inMemoryCache.has(cacheKey)).toBe(false);
      });
    });
  });

  describe("updateConversationsRetention", () => {
    it("should reject values below the minimum retention", async () => {
      const result = await WorkspaceResource.updateConversationsRetention(
        workspace.id,
        INVALID_RETENTION_DAYS
      );

      expect(result.isErr()).toBe(true);

      const updated = await WorkspaceResource.fetchById(workspace.sId);
      expect(updated?.conversationsRetentionDays).toBeNull();
    });

    it("should allow sub-60 retention days value", async () => {
      const result = await WorkspaceResource.updateConversationsRetention(
        workspace.id,
        SHORT_RETENTION_DAYS
      );

      expect(result.isOk()).toBe(true);

      const updated = await WorkspaceResource.fetchById(workspace.sId);
      expect(updated?.conversationsRetentionDays).toBe(SHORT_RETENTION_DAYS);
    });

    it("should convert -1 to null", async () => {
      // First set a value
      await WorkspaceResource.updateConversationsRetention(
        workspace.id,
        SHORT_RETENTION_DAYS
      );

      // Then set -1 which should convert to null
      const result = await WorkspaceResource.updateConversationsRetention(
        workspace.id,
        -1
      );

      expect(result.isOk()).toBe(true);

      const updated = await WorkspaceResource.fetchById(workspace.sId);
      expect(updated?.conversationsRetentionDays).toBeNull();
    });

    it("should reject values below the minimum retention through generic updates", async () => {
      const result = await WorkspaceResource.updateByModelIdAndCheckExistence(
        workspace.id,
        {
          conversationsRetentionDays: INVALID_RETENTION_DAYS,
        }
      );

      expect(result.isErr()).toBe(true);

      const updated = await WorkspaceResource.fetchById(workspace.sId);
      expect(updated?.conversationsRetentionDays).toBeNull();
    });
  });

  describe("disableSSOEnforcement", () => {
    it("should disable SSO when enabled", async () => {
      // Enable SSO first
      await WorkspaceResource.updateByModelIdAndCheckExistence(workspace.id, {
        ssoEnforced: true,
      });

      const result = await WorkspaceResource.disableSSOEnforcement(
        workspace.id
      );

      expect(result.isOk()).toBe(true);

      const updated = await WorkspaceResource.fetchById(workspace.sId);
      expect(updated?.ssoEnforced).toBe(false);
    });

    it("should return error when SSO already disabled", async () => {
      // SSO is disabled by default, try to disable again
      const result = await WorkspaceResource.disableSSOEnforcement(
        workspace.id
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          "SSO enforcement is already disabled."
        );
      }
    });
  });

  describe("canShareInteractiveContentPublicly", () => {
    it("should return true by default when no metadata", async () => {
      const resource = await WorkspaceResource.fetchById(workspace.sId);

      expect(resource?.canShareInteractiveContentPublicly).toBe(true);
      expect(resource?.sharingPolicy).toBe("all_scopes");
    });

    it("should return false when metadata.allowContentCreationFileSharing is false", async () => {
      await WorkspaceResource.updateMetadata(workspace.id, {
        allowContentCreationFileSharing: false,
      });

      const resource = await WorkspaceResource.fetchById(workspace.sId);

      expect(resource?.canShareInteractiveContentPublicly).toBe(false);
      expect(resource?.sharingPolicy).toBe("workspace_and_emails");
    });

    it("should return true when metadata.allowContentCreationFileSharing is true", async () => {
      await WorkspaceResource.updateMetadata(workspace.id, {
        allowContentCreationFileSharing: true,
      });

      const resource = await WorkspaceResource.fetchById(workspace.sId);

      expect(resource?.canShareInteractiveContentPublicly).toBe(true);
      expect(resource?.sharingPolicy).toBe("all_scopes");
    });

    it("should not change sharingPolicy when updating unrelated metadata", async () => {
      await WorkspaceResource.updateMetadata(workspace.id, {
        allowContentCreationFileSharing: false,
      });
      await WorkspaceResource.updateMetadata(workspace.id, {
        allowVoiceTranscription: true,
      });

      const resource = await WorkspaceResource.fetchById(workspace.sId);

      expect(resource?.sharingPolicy).toBe("workspace_and_emails");
    });
  });

  describe("verified domains", () => {
    describe("getVerifiedDomains", () => {
      it("should return empty array when no domains", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);

        const domains = await resource?.getVerifiedDomains();

        expect(domains).toEqual([]);
      });

      it("should return domains when added", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);
        await resource?.upsertWorkspaceDomain({ domain: "example.com" });

        const domains = await resource?.getVerifiedDomains();

        expect(domains).toHaveLength(1);
        expect(domains?.[0].domain).toBe("example.com");
        expect(domains?.[0].domainAutoJoinEnabled).toBe(false);
      });
    });

    describe("upsertWorkspaceDomain", () => {
      it("should create a new domain", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);

        const result = await resource?.upsertWorkspaceDomain({
          domain: "newdomain.com",
        });

        expect(result?.isOk()).toBe(true);
        if (result?.isOk()) {
          expect(result.value.domain).toBe("newdomain.com");
          expect(result.value.domainAutoJoinEnabled).toBe(false);
        }
      });

      it("should return existing domain if already linked to same workspace", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);
        await resource?.upsertWorkspaceDomain({ domain: "existing.com" });

        const result = await resource?.upsertWorkspaceDomain({
          domain: "existing.com",
        });

        expect(result?.isOk()).toBe(true);
        if (result?.isOk()) {
          expect(result.value.domain).toBe("existing.com");
        }
      });

      it("should return error if domain belongs to another workspace", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);
        await resource?.upsertWorkspaceDomain({ domain: "taken.com" });

        const otherWorkspace = await WorkspaceFactory.basic();
        const otherResource = await WorkspaceResource.fetchById(
          otherWorkspace.sId
        );

        const result = await otherResource?.upsertWorkspaceDomain({
          domain: "taken.com",
        });

        expect(result?.isErr()).toBe(true);
        if (result?.isErr()) {
          expect(result.error.message).toContain("already exists in workspace");
        }
      });
    });

    describe("deleteDomain", () => {
      it("should delete an existing domain", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);
        await resource?.upsertWorkspaceDomain({ domain: "todelete.com" });

        const result = await resource?.deleteDomain({ domain: "todelete.com" });

        expect(result?.isOk()).toBe(true);
        const domains = await resource?.getVerifiedDomains();
        expect(domains).toEqual([]);
      });

      it("should return error when domain not found", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);

        const result = await resource?.deleteDomain({
          domain: "nonexistent.com",
        });

        expect(result?.isErr()).toBe(true);
        if (result?.isErr()) {
          expect(result.error.message).toContain("not found");
        }
      });
    });

    describe("updateDomainAutoJoinEnabled", () => {
      it("should enable auto-join for a domain", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);
        await resource?.upsertWorkspaceDomain({ domain: "autojoin.com" });

        const result = await resource?.updateDomainAutoJoinEnabled({
          domainAutoJoinEnabled: true,
          domain: "autojoin.com",
        });

        expect(result?.isOk()).toBe(true);
        const domains = await resource?.getVerifiedDomains();
        expect(domains?.[0].domainAutoJoinEnabled).toBe(true);
      });

      it("should disable auto-join for a domain", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);
        await resource?.upsertWorkspaceDomain({ domain: "autojoin2.com" });
        await resource?.updateDomainAutoJoinEnabled({
          domainAutoJoinEnabled: true,
          domain: "autojoin2.com",
        });

        const result = await resource?.updateDomainAutoJoinEnabled({
          domainAutoJoinEnabled: false,
          domain: "autojoin2.com",
        });

        expect(result?.isOk()).toBe(true);
        const domains = await resource?.getVerifiedDomains();
        expect(domains?.[0].domainAutoJoinEnabled).toBe(false);
      });

      it("should return error when workspace has no verified domains", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);

        const result = await resource?.updateDomainAutoJoinEnabled({
          domainAutoJoinEnabled: true,
        });

        expect(result?.isErr()).toBe(true);
        if (result?.isErr()) {
          expect(result.error.message).toBe(
            "The workspace does not have any verified domain."
          );
        }
      });
    });

    describe("fetchByDomain", () => {
      it("should return workspace when domain exists", async () => {
        const resource = await WorkspaceResource.fetchById(workspace.sId);
        await resource?.upsertWorkspaceDomain({ domain: "findme.com" });

        const found = await WorkspaceResource.fetchByDomain("findme.com");

        expect(found).not.toBeNull();
        expect(found?.sId).toBe(workspace.sId);
      });

      it("should return null when domain does not exist", async () => {
        const found = await WorkspaceResource.fetchByDomain("doesnotexist.com");

        expect(found).toBeNull();
      });
    });
  });

  describe("getWhiteListedProvidersFilteredByKillSwitches", () => {
    beforeEach(() => {
      listEnabledKillSwitches.mockResolvedValue([]);
    });

    it("returns whiteListedProviders when no kill switches are enabled", async () => {
      const providers = ["openai", "anthropic", "mistral"] as const;

      const result =
        await WorkspaceResource.getWhiteListedProvidersFilteredByKillSwitches([
          ...providers,
        ]);

      expect(result).toEqual([...providers]);
    });

    it("returns null when whiteListedProviders is null and no kill switches", async () => {
      const result =
        await WorkspaceResource.getWhiteListedProvidersFilteredByKillSwitches(
          null
        );

      expect(result).toBeNull();
    });

    it("filters out anthropic when global_blacklist_anthropic is enabled", async () => {
      listEnabledKillSwitches.mockResolvedValue(["global_blacklist_anthropic"]);

      const result =
        await WorkspaceResource.getWhiteListedProvidersFilteredByKillSwitches([
          "openai",
          "anthropic",
          "mistral",
        ]);

      expect(result).toEqual(["openai", "mistral"]);
    });

    it("filters out openai when global_blacklist_openai is enabled", async () => {
      listEnabledKillSwitches.mockResolvedValue(["global_blacklist_openai"]);

      const result =
        await WorkspaceResource.getWhiteListedProvidersFilteredByKillSwitches([
          "openai",
          "anthropic",
          "mistral",
        ]);

      expect(result).toEqual(["anthropic", "mistral"]);
    });

    it("filters out both anthropic and openai when both kill switches are enabled", async () => {
      listEnabledKillSwitches.mockResolvedValue([
        "global_blacklist_anthropic",
        "global_blacklist_openai",
      ]);

      const result =
        await WorkspaceResource.getWhiteListedProvidersFilteredByKillSwitches([
          "openai",
          "anthropic",
          "mistral",
        ]);

      expect(result).toEqual(["mistral"]);
    });

    it("uses MODEL_PROVIDER_IDS and filters anthropic when whiteListedProviders is null and anthropic is blacklisted", async () => {
      listEnabledKillSwitches.mockResolvedValue(["global_blacklist_anthropic"]);

      const result =
        await WorkspaceResource.getWhiteListedProvidersFilteredByKillSwitches(
          null
        );

      expect(result).not.toBeNull();
      expect(result).not.toContain("anthropic");
      expect(result).toContain("openai");
      expect(result).toContain("mistral");
    });

    it("uses MODEL_PROVIDER_IDS and filters openai when whiteListedProviders is null and openai is blacklisted", async () => {
      listEnabledKillSwitches.mockResolvedValue(["global_blacklist_openai"]);

      const result =
        await WorkspaceResource.getWhiteListedProvidersFilteredByKillSwitches(
          null
        );

      expect(result).not.toBeNull();
      expect(result).not.toContain("openai");
      expect(result).toContain("anthropic");
      expect(result).toContain("mistral");
    });

    it("keeps the configured whiteListedProviders on uncached fetch paths even when kill switches are enabled", async () => {
      workspace = await WorkspaceFactory.basic({
        whiteListedProviders: ["openai", "anthropic"],
      });
      listEnabledKillSwitches.mockResolvedValue(["global_blacklist_openai"]);

      const [resource] = await WorkspaceResource.fetchByIds([workspace.sId]);

      expect(resource?.configuredWhiteListedProviders).toEqual([
        "openai",
        "anthropic",
      ]);
    });
  });

  describe("fetchWhiteListedProviders", () => {
    it("returns the configured value when no kill switches are enabled", async () => {
      workspace = await WorkspaceFactory.basic({
        whiteListedProviders: ["openai", "anthropic"],
      });
      const resource = await WorkspaceResource.fetchById(workspace.sId);

      await expect(resource?.fetchWhiteListedProviders()).resolves.toEqual([
        "openai",
        "anthropic",
      ]);
    });

    it("overlays the global provider kill switches", async () => {
      workspace = await WorkspaceFactory.basic({
        whiteListedProviders: ["openai", "anthropic"],
      });
      listEnabledKillSwitches.mockResolvedValue(["global_blacklist_openai"]);

      const resource = await WorkspaceResource.fetchById(workspace.sId);

      await expect(resource?.fetchWhiteListedProviders()).resolves.toEqual([
        "anthropic",
      ]);
    });
  });

  describe("plan limit overrides", () => {
    it("returns null when the workspace has no override", async () => {
      await expect(
        WorkspaceResource.fetchPlanLimitOverride(workspace.id)
      ).resolves.toBeNull();
    });

    it("upserts, then fetches the override", async () => {
      const result = await WorkspaceResource.upsertPlanLimitOverride(
        workspace.id,
        {
          ...EMPTY_PLAN_LIMIT_OVERRIDE,
          maxUsersInWorkspace: 42,
          maxVaultsInWorkspace: -1,
        }
      );
      expect(result.isOk()).toBe(true);

      await expect(
        WorkspaceResource.fetchPlanLimitOverride(workspace.id)
      ).resolves.toEqual({
        ...EMPTY_PLAN_LIMIT_OVERRIDE,
        maxUsersInWorkspace: 42,
        maxVaultsInWorkspace: -1,
      });
    });

    it("replaces the existing override on a second upsert", async () => {
      await WorkspaceResource.upsertPlanLimitOverride(workspace.id, {
        ...EMPTY_PLAN_LIMIT_OVERRIDE,
        maxUsersInWorkspace: 42,
      });
      await WorkspaceResource.upsertPlanLimitOverride(workspace.id, {
        ...EMPTY_PLAN_LIMIT_OVERRIDE,
        maxDataSourcesCount: 7,
      });

      await expect(
        WorkspaceResource.fetchPlanLimitOverride(workspace.id)
      ).resolves.toEqual({
        ...EMPTY_PLAN_LIMIT_OVERRIDE,
        maxDataSourcesCount: 7,
      });
    });

    it("deletes the row when no override remains", async () => {
      await WorkspaceResource.upsertPlanLimitOverride(workspace.id, {
        ...EMPTY_PLAN_LIMIT_OVERRIDE,
        maxUsersInWorkspace: 42,
      });

      const result = await WorkspaceResource.upsertPlanLimitOverride(
        workspace.id,
        EMPTY_PLAN_LIMIT_OVERRIDE
      );
      expect(result.isOk()).toBe(true);

      await expect(
        WorkspaceResource.fetchPlanLimitOverride(workspace.id)
      ).resolves.toBeNull();
    });

    it("rejects a limit below -1 and a non-integer limit", async () => {
      const belowUnlimited = await WorkspaceResource.upsertPlanLimitOverride(
        workspace.id,
        { ...EMPTY_PLAN_LIMIT_OVERRIDE, maxUsersInWorkspace: -2 }
      );
      expect(belowUnlimited.isErr()).toBe(true);

      const nonInteger = await WorkspaceResource.upsertPlanLimitOverride(
        workspace.id,
        { ...EMPTY_PLAN_LIMIT_OVERRIDE, maxUsersInWorkspace: 1.5 }
      );
      expect(nonInteger.isErr()).toBe(true);

      await expect(
        WorkspaceResource.fetchPlanLimitOverride(workspace.id)
      ).resolves.toBeNull();
    });

    it("fetches overrides for several workspaces at once, skipping those without any", async () => {
      const otherWorkspace = await WorkspaceFactory.basic();
      const workspaceWithoutOverride = await WorkspaceFactory.basic();

      await WorkspaceResource.upsertPlanLimitOverride(workspace.id, {
        ...EMPTY_PLAN_LIMIT_OVERRIDE,
        maxUsersInWorkspace: 42,
      });
      await WorkspaceResource.upsertPlanLimitOverride(otherWorkspace.id, {
        ...EMPTY_PLAN_LIMIT_OVERRIDE,
        maxConnectionsCount: 3,
      });

      const overrides =
        await WorkspaceResource.fetchPlanLimitOverridesByWorkspaceModelIds([
          workspace.id,
          otherWorkspace.id,
          workspaceWithoutOverride.id,
        ]);

      expect(overrides.size).toBe(2);
      expect(overrides.get(workspace.id)).toEqual({
        ...EMPTY_PLAN_LIMIT_OVERRIDE,
        maxUsersInWorkspace: 42,
      });
      expect(overrides.get(otherWorkspace.id)).toEqual({
        ...EMPTY_PLAN_LIMIT_OVERRIDE,
        maxConnectionsCount: 3,
      });
      expect(overrides.has(workspaceWithoutOverride.id)).toBe(false);
    });

    it("returns an empty map when no workspace model id is requested", async () => {
      await expect(
        WorkspaceResource.fetchPlanLimitOverridesByWorkspaceModelIds([])
      ).resolves.toEqual(new Map());
    });

    it("deletes all overrides for a workspace", async () => {
      await WorkspaceResource.upsertPlanLimitOverride(workspace.id, {
        ...EMPTY_PLAN_LIMIT_OVERRIDE,
        maxUsersInWorkspace: 42,
      });

      await WorkspaceResource.deleteAllPlanLimitOverridesForWorkspace(
        workspace.id
      );

      await expect(
        WorkspaceResource.fetchPlanLimitOverride(workspace.id)
      ).resolves.toBeNull();
    });
  });
});
