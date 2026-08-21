import { getRedisCacheClient, runOnRedisCache } from "@app/lib/api/redis";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE_MODEL_ID = 42;
const GROUP_MODEL_ID = 7;

const lookupUrl = `/api/poke/cache?resourceId=group_permissions_by_workspace&params=${encodeURIComponent(
  JSON.stringify({ workspaceModelId: String(WORKSPACE_MODEL_ID) })
)}`;

describe("Poke cache: group permissions", () => {
  beforeEach(async () => {
    await createPrivateApiMockRequest({ isSuperUser: true });

    const redis = await getRedisCacheClient({
      origin: "group_permissions_cache",
    });
    await redis.hSet(
      GroupPermissionResource.cacheOperations.buildKey({
        workspaceModelId: String(WORKSPACE_MODEL_ID),
      }),
      {
        [String(GROUP_MODEL_ID)]: JSON.stringify([["reader", "space", 1]]),
      }
    );
  });

  it("finds the cached grants behind the workspace hash key", async () => {
    const response = await honoApp.request(lookupUrl);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      key: `group_permissions:v1:ws:${WORKSPACE_MODEL_ID}`,
      cacheRedis: {
        value: { [String(GROUP_MODEL_ID)]: [["reader", "space", 1]] },
      },
    });
  });

  it("flushes a single workspace", async () => {
    const deleteResponse = await honoApp.request(
      `${lookupUrl}&redisInstance=cache`,
      { method: "DELETE" }
    );

    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.json()).toMatchObject({
      key: `group_permissions:v1:ws:${WORKSPACE_MODEL_ID}`,
      deleted: true,
    });

    const lookupResponse = await honoApp.request(lookupUrl);
    expect(await lookupResponse.json()).toMatchObject({
      cacheRedis: { value: null },
    });
  });
});

const workspaceId = "cache-cutover-test-workspace";
const newKey = `cacheWithRedis-workspace_by_sid-v3:${workspaceId}`;
const previousKey = `cacheWithRedis-_fetchByIdUncached-workspace:v2:${workspaceId}`;

describe("DELETE /api/poke/cache", () => {
  const deleteKey = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runOnRedisCache).mockImplementation(async (_options, fn) =>
      fn({ del: deleteKey } as never)
    );
  });

  it("deletes the new and previous keys", async () => {
    await createPrivateApiMockRequest({
      method: "DELETE",
      isSuperUser: true,
    });
    const query = new URLSearchParams({
      resourceId: "workspace_by_sid",
      params: JSON.stringify({ wId: workspaceId }),
      redisInstance: "cache",
    });

    const response = await honoApp.request(`/api/poke/cache?${query}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(200);
    expect(deleteKey).toHaveBeenCalledTimes(2);
    expect(deleteKey).toHaveBeenCalledWith(newKey);
    expect(deleteKey).toHaveBeenCalledWith(previousKey);
  });
});
