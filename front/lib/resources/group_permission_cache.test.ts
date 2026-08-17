import type { CacheableFunction, JsonSerializable } from "@app/lib/utils/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

const inMemoryCache = vi.hoisted(() => new Map<string, string>());
const cacheMisses = vi.hoisted(() => ({ count: 0 }));
const cacheLoad = vi.hoisted(() => ({
  blocker: null as Promise<void> | null,
  resultReady: null as (() => void) | null,
}));
const generationCache = vi.hoisted(() => ({
  values: new Map<string, number>(),
  calls: 0,
  blocker: null as Promise<void> | null,
  advanceOnRead: false,
}));

vi.mock("@app/lib/api/redis", () => ({
  getRedisCacheClient: vi.fn().mockResolvedValue({
    get: vi.fn().mockImplementation((key: string) => {
      let generation = generationCache.values.get(key);
      if (generationCache.advanceOnRead) {
        generation = (generation ?? 0) + 1;
        generationCache.values.set(key, generation);
      }
      return Promise.resolve(generation?.toString() ?? null);
    }),
    eval: vi
      .fn()
      .mockImplementation(
        async (
          _script: string,
          { keys: [generationKey] }: { keys: string[] }
        ) => {
          generationCache.calls += 1;
          await generationCache.blocker;
          generationCache.values.set(
            generationKey,
            (generationCache.values.get(generationKey) ?? 0) + 1
          );
          return generationCache.values.get(generationKey);
        }
      ),
  }),
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
          resolver: (...args: Args) => string,
          options: { cacheId?: string }
        ) => {
          return async (...args: Args): Promise<JsonSerializable<T>> => {
            const key = `cacheWithRedis-${options.cacheId ?? fn.name}-${resolver(...args)}`;
            const cached = inMemoryCache.get(key);
            if (cached) {
              return JSON.parse(cached) as JsonSerializable<T>;
            }
            cacheMisses.count += 1;
            const result = await fn(...args);
            cacheLoad.resultReady?.();
            await cacheLoad.blocker;
            inMemoryCache.set(key, JSON.stringify(result));
            return result;
          };
        }
      ),
  };
});

import { Authenticator } from "@app/lib/auth";
import {
  WORKSPACE_GRANTS_CACHE_ID,
  workspaceGrantsCacheKeyResolver,
} from "@app/lib/resources/group_permission_cache";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { getNamespace } from "@app/tests/utils/test_cls";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";

function workspaceGrantsCacheKey(workspaceModelId: number): string {
  const generation =
    generationCache.values.get(
      `workspace-group-permissions-generation:${workspaceModelId}`
    ) ?? 0;
  return `cacheWithRedis-${WORKSPACE_GRANTS_CACHE_ID}-${workspaceGrantsCacheKeyResolver(workspaceModelId, generation)}`;
}

describe("GroupPermissionResource workspace cache", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let auth: Authenticator;
  let groupA: GroupResource;
  let groupB: GroupResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);
    groupA = await GroupFactory.regularManual(workspace, "A");
    groupB = await GroupFactory.regularManual(workspace, "B");
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    inMemoryCache.clear();
    cacheMisses.count = 0;
    cacheLoad.blocker = null;
    cacheLoad.resultReady = null;
    generationCache.values.clear();
    generationCache.calls = 0;
    generationCache.blocker = null;
    generationCache.advanceOnRead = false;
  });

  it("shares one workspace snapshot while filtering the current group ids", async () => {
    await GroupPermissionResource.grant(auth, {
      group: groupA,
      grantType: "reader",
      resourceType: "space",
      resourceId: 1,
    });
    await GroupPermissionResource.grant(auth, {
      group: groupB,
      grantType: "reader",
      resourceType: "space",
      resourceId: 2,
    });

    const grantsForA =
      await GroupPermissionResource.listForGroupsFromWorkspaceCache(workspace, [
        groupA.id,
      ]);
    const grantsForB =
      await GroupPermissionResource.listForGroupsFromWorkspaceCache(workspace, [
        groupB.id,
      ]);

    expect(cacheMisses.count).toBe(1);
    expect(grantsForA.map((grant) => grant.groupModelId)).toEqual([groupA.id]);
    expect(grantsForB.map((grant) => grant.groupModelId)).toEqual([groupB.id]);
    expect(inMemoryCache.size).toBe(1);
  });

  it("advances the snapshot generation after a grant transaction commits", async () => {
    await GroupPermissionResource.listForGroupsFromWorkspaceCache(workspace, [
      groupA.id,
    ]);
    const cacheKey = workspaceGrantsCacheKey(workspace.id);
    expect(inMemoryCache.has(cacheKey)).toBe(true);

    const parentTransaction =
      getNamespace("test-namespace")?.get("transaction");
    expect(parentTransaction).toBeDefined();
    const transaction = await frontSequelize.transaction({
      transaction: parentTransaction,
    });

    await GroupPermissionResource.grant(auth, {
      group: groupA,
      grantType: "reader",
      resourceType: "space",
      resourceId: 1,
      transaction,
    });
    expect(inMemoryCache.has(cacheKey)).toBe(true);

    await transaction.commit();
    expect(inMemoryCache.has(cacheKey)).toBe(true);
    expect(workspaceGrantsCacheKey(workspace.id)).not.toBe(cacheKey);
    expect(inMemoryCache.has(workspaceGrantsCacheKey(workspace.id))).toBe(
      false
    );

    const grants =
      await GroupPermissionResource.listForGroupsFromWorkspaceCache(workspace, [
        groupA.id,
      ]);
    expect(grants).toMatchObject([{ groupModelId: groupA.id, resourceId: 1 }]);
  });

  it("keeps the snapshot when a grant transaction rolls back", async () => {
    await GroupPermissionResource.listForGroupsFromWorkspaceCache(workspace, [
      groupA.id,
    ]);
    const cacheKey = workspaceGrantsCacheKey(workspace.id);

    const parentTransaction =
      getNamespace("test-namespace")?.get("transaction");
    expect(parentTransaction).toBeDefined();
    const transaction = await frontSequelize.transaction({
      transaction: parentTransaction,
    });

    await GroupPermissionResource.grant(auth, {
      group: groupA,
      grantType: "reader",
      resourceType: "space",
      resourceId: 1,
      transaction,
    });
    await transaction.rollback();

    expect(inMemoryCache.has(cacheKey)).toBe(true);
    expect(
      await GroupPermissionResource.listForGroupsFromWorkspaceCache(workspace, [
        groupA.id,
      ])
    ).toEqual([]);
  });

  it("advances the snapshot generation after revoking a grant", async () => {
    await GroupPermissionResource.grant(auth, {
      group: groupA,
      grantType: "reader",
      resourceType: "space",
      resourceId: 1,
    });
    await GroupPermissionResource.listForGroupsFromWorkspaceCache(workspace, [
      groupA.id,
    ]);

    await GroupPermissionResource.revoke(auth, {
      group: groupA,
      grantType: "reader",
      resourceType: "space",
      resourceId: 1,
    });

    expect(inMemoryCache.has(workspaceGrantsCacheKey(workspace.id))).toBe(
      false
    );
  });

  it("retries when a revocation commits during a cache fill", async () => {
    await GroupPermissionResource.grant(auth, {
      group: groupA,
      grantType: "reader",
      resourceType: "space",
      resourceId: 1,
    });

    let releaseCacheLoad: () => void = () => {};
    cacheLoad.blocker = new Promise<void>((resolve) => {
      releaseCacheLoad = resolve;
    });
    let signalCacheResultReady: () => void = () => {};
    const cacheResultReady = new Promise<void>((resolve) => {
      signalCacheResultReady = resolve;
    });
    cacheLoad.resultReady = signalCacheResultReady;

    const grantsPromise =
      GroupPermissionResource.listForGroupsFromWorkspaceCache(workspace, [
        groupA.id,
      ]);
    await cacheResultReady;

    await GroupPermissionResource.revoke(auth, {
      group: groupA,
      grantType: "reader",
      resourceType: "space",
      resourceId: 1,
    });
    releaseCacheLoad();

    await expect(grantsPromise).resolves.toEqual([]);
    expect(cacheMisses.count).toBe(2);
  });

  it("falls back to the database query during continuous generation churn", async () => {
    await GroupPermissionResource.grant(auth, {
      group: groupA,
      grantType: "reader",
      resourceType: "space",
      resourceId: 1,
    });
    const databaseLookup = vi.spyOn(GroupPermissionResource, "listForGroups");
    generationCache.advanceOnRead = true;

    const grants =
      await GroupPermissionResource.listForGroupsFromWorkspaceCache(workspace, [
        groupA.id,
      ]);

    expect(databaseLookup).toHaveBeenCalledTimes(1);
    expect(grants).toMatchObject([{ groupModelId: groupA.id, resourceId: 1 }]);
  });

  it("waits for a generation advance without an explicit transaction", async () => {
    await GroupPermissionResource.grant(auth, {
      group: groupA,
      grantType: "reader",
      resourceType: "space",
      resourceId: 1,
    });
    await GroupPermissionResource.listForGroupsFromWorkspaceCache(workspace, [
      groupA.id,
    ]);

    generationCache.calls = 0;
    let releaseGenerationAdvance: () => void = () => {};
    generationCache.blocker = new Promise<void>((resolve) => {
      releaseGenerationAdvance = resolve;
    });
    let revokeSettled = false;
    const revokePromise = GroupPermissionResource.revoke(auth, {
      group: groupA,
      grantType: "reader",
      resourceType: "space",
      resourceId: 1,
    }).then(() => {
      revokeSettled = true;
    });

    await vi.waitFor(() => expect(generationCache.calls).toBe(1));
    expect(revokeSettled).toBe(false);

    releaseGenerationAdvance();
    await revokePromise;
    expect(inMemoryCache.has(workspaceGrantsCacheKey(workspace.id))).toBe(
      false
    );
  });

  it("invalidates the snapshot when group deletion removes grants", async () => {
    await GroupPermissionResource.grant(auth, {
      group: groupB,
      grantType: "reader",
      resourceType: "space",
      resourceId: 1,
    });
    await GroupPermissionResource.listForGroupsFromWorkspaceCache(workspace, [
      groupB.id,
    ]);

    const deleteResult = await groupB.delete(auth);

    expect(deleteResult.isOk()).toBe(true);
    expect(inMemoryCache.has(workspaceGrantsCacheKey(workspace.id))).toBe(
      false
    );
  });
});
