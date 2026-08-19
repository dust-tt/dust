import { getRedisCacheClient } from "@app/lib/api/redis";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it } from "vitest";

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
