import type { CacheableFunction, JsonSerializable } from "@app/lib/utils/cache";
import { describe, expect, it, vi } from "vitest";

// Replace the Redis-backed subscription cache with an in-memory map so the
// post-swap rehydrate observes the new subscription synchronously, regardless
// of Redis. Mirrors the pattern in subscription_resource.test.ts.
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
        return (...args: Args): Promise<void> => {
          const key = `cacheWithRedis-${fn.name}-${resolver(...args)}`;
          inMemoryCache.delete(key);
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
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { PlanFactory } from "@app/tests/utils/PlanFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";

async function swapSubscription(workspaceId: string): Promise<string> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw new Error("Test setup: workspace not found");
  }
  const active = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );
  if (!active) {
    throw new Error("Test setup: workspace has no active subscription");
  }
  await active.markAsEnded("ended");

  const plan = await PlanFactory.enterprise();
  const newSubId = generateRandomModelSId();
  await SubscriptionResource.makeNew(
    {
      sId: newSubId,
      workspaceId: workspace.id,
      planId: plan.id,
      status: "active",
      startDate: new Date(),
      endDate: null,
      stripeSubscriptionId: null,
    },
    renderPlanFromModel({ plan })
  );
  return newSubId;
}

describe("Authenticator.fromJSON", () => {
  it("returns an Authenticator bound to the workspace's current active subscription, even when the serialized subscriptionId is stale", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const authJson = auth.toJSON();
    expect(authJson.subscriptionId).not.toBeNull();

    const newSubId = await swapSubscription(workspace.sId);

    const fresh = await Authenticator.fromJSON(authJson);
    expect(fresh.plan()).not.toBeNull();
    expect(fresh.subscription()?.sId).toBe(newSubId);
  });
});
