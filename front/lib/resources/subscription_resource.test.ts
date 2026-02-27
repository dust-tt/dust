import type { CacheableFunction, JsonSerializable } from "@app/lib/utils/cache";
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

import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";

function getCacheKeyForWorkspace(workspaceModelId: number): string {
  return `cacheWithRedis-_fetchActiveByWorkspaceModelIdUncached-subscription:active:workspaceId:${workspaceModelId}`;
}

describe("SubscriptionResource", () => {
  let workspace: WorkspaceType;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    inMemoryCache.clear();
    deletedKeys.length = 0;
  });

  describe("caching behavior", () => {
    describe("fetchActiveByWorkspaceModelId", () => {
      it("caches the subscription on first call", async () => {
        const workspaceModelId = workspace.id;
        const cacheKey = getCacheKeyForWorkspace(workspaceModelId);

        expect(inMemoryCache.has(cacheKey)).toBe(false);
        await SubscriptionResource.fetchActiveByWorkspaceModelId(
          workspaceModelId
        );
        expect(inMemoryCache.has(cacheKey)).toBe(true);
      });

      it("serves from cache on second call", async () => {
        const workspaceModelId = workspace.id;
        const cacheKey = getCacheKeyForWorkspace(workspaceModelId);

        await SubscriptionResource.fetchActiveByWorkspaceModelId(
          workspaceModelId
        );
        expect(inMemoryCache.has(cacheKey)).toBe(true);

        await SubscriptionResource.fetchActiveByWorkspaceModelId(
          workspaceModelId
        );
        expect(inMemoryCache.has(cacheKey)).toBe(true);
      });
    });

    describe("makeNew", () => {
      it("invalidates cache when subscription is created", async () => {
        const newWorkspace = await WorkspaceFactory.basic();
        const newWorkspaceModelId = newWorkspace.id;
        const cacheKey = getCacheKeyForWorkspace(newWorkspaceModelId);

        expect(deletedKeys).toContain(cacheKey);
      });
    });

    describe("markAsEnded", () => {
      it("invalidates cache when subscription is ended", async () => {
        const workspaceModelId = workspace.id;
        const cacheKey = getCacheKeyForWorkspace(workspaceModelId);

        const subscription =
          await SubscriptionResource.fetchActiveByWorkspaceModelId(
            workspaceModelId
          );
        expect(inMemoryCache.has(cacheKey)).toBe(true);
        deletedKeys.length = 0;

        await subscription?.markAsEnded("ended");

        expect(deletedKeys).toContain(cacheKey);
        expect(inMemoryCache.has(cacheKey)).toBe(false);
      });
    });

    describe("clearPaymentFailingStatus", () => {
      it("invalidates cache when payment status is cleared", async () => {
        const workspaceModelId = workspace.id;
        const cacheKey = getCacheKeyForWorkspace(workspaceModelId);

        const subscription =
          await SubscriptionResource.fetchActiveByWorkspaceModelId(
            workspaceModelId
          );
        expect(inMemoryCache.has(cacheKey)).toBe(true);
        deletedKeys.length = 0;

        await subscription?.clearPaymentFailingStatus();

        expect(deletedKeys).toContain(cacheKey);
        expect(inMemoryCache.has(cacheKey)).toBe(false);
      });
    });

    describe("setPaymentFailingStatus", () => {
      it("invalidates cache when payment status is set", async () => {
        const workspaceModelId = workspace.id;
        const cacheKey = getCacheKeyForWorkspace(workspaceModelId);

        const subscription =
          await SubscriptionResource.fetchActiveByWorkspaceModelId(
            workspaceModelId
          );
        expect(inMemoryCache.has(cacheKey)).toBe(true);
        deletedKeys.length = 0;

        await subscription?.setPaymentFailingStatus({
          paymentFailingSince: new Date(),
        });

        expect(deletedKeys).toContain(cacheKey);
        expect(inMemoryCache.has(cacheKey)).toBe(false);
      });
    });

    describe("markAsCanceled", () => {
      it("invalidates cache when subscription is canceled", async () => {
        const workspaceModelId = workspace.id;
        const cacheKey = getCacheKeyForWorkspace(workspaceModelId);

        const subscription =
          await SubscriptionResource.fetchActiveByWorkspaceModelId(
            workspaceModelId
          );
        expect(inMemoryCache.has(cacheKey)).toBe(true);
        deletedKeys.length = 0;

        await subscription?.markAsCanceled({ endDate: new Date() });

        expect(deletedKeys).toContain(cacheKey);
        expect(inMemoryCache.has(cacheKey)).toBe(false);
      });

      it("invalidates cache when subscription cancellation is reverted", async () => {
        const workspaceModelId = workspace.id;
        const cacheKey = getCacheKeyForWorkspace(workspaceModelId);

        const subscription =
          await SubscriptionResource.fetchActiveByWorkspaceModelId(
            workspaceModelId
          );
        await subscription?.markAsCanceled({ endDate: new Date() });

        await SubscriptionResource.fetchActiveByWorkspaceModelId(
          workspaceModelId
        );
        expect(inMemoryCache.has(cacheKey)).toBe(true);
        deletedKeys.length = 0;

        await subscription?.markAsCanceled({ endDate: null });

        expect(deletedKeys).toContain(cacheKey);
        expect(inMemoryCache.has(cacheKey)).toBe(false);
      });
    });

    describe("markAsActive", () => {
      it("invalidates cache when subscription is marked active", async () => {
        const workspaceModelId = workspace.id;
        const cacheKey = getCacheKeyForWorkspace(workspaceModelId);

        const subscription =
          await SubscriptionResource.fetchActiveByWorkspaceModelId(
            workspaceModelId
          );
        expect(inMemoryCache.has(cacheKey)).toBe(true);
        deletedKeys.length = 0;

        await subscription?.markAsActive({ trialing: false });

        expect(deletedKeys).toContain(cacheKey);
        expect(inMemoryCache.has(cacheKey)).toBe(false);
      });

      it("invalidates cache when subscription is marked as trialing", async () => {
        const workspaceModelId = workspace.id;
        const cacheKey = getCacheKeyForWorkspace(workspaceModelId);

        const subscription =
          await SubscriptionResource.fetchActiveByWorkspaceModelId(
            workspaceModelId
          );
        expect(inMemoryCache.has(cacheKey)).toBe(true);
        deletedKeys.length = 0;

        await subscription?.markAsActive({ trialing: true });

        expect(deletedKeys).toContain(cacheKey);
        expect(inMemoryCache.has(cacheKey)).toBe(false);
      });
    });
  });
});
