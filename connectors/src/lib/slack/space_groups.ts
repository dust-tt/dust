import { apiConfig } from "@connectors/lib/api/config";
import logger from "@connectors/logger/logger";
import type { ModelId } from "@connectors/types";
import { buildCacheWithRedisKey, cacheWithRedis } from "@connectors/types";
import { redisClient } from "@connectors/types/shared/redis_client";
import { DustAPI } from "@dust-tt/client";

const SPACE_GROUP_IDS_CACHE_TTL_MS = 5 * 60 * 1000;

type SpaceGroupsRequest = {
  workspaceId: string;
  workspaceAPIKey: string;
  spaceIds: string[];
};

async function fetchSpaceGroupIds(
  whitelistModelId: ModelId,
  { workspaceId, workspaceAPIKey, spaceIds }: SpaceGroupsRequest
): Promise<string[]> {
  const dustAPI = new DustAPI(
    { url: apiConfig.getDustFrontAPIUrl() },
    { workspaceId, apiKey: workspaceAPIKey },
    logger
  );

  const groupIdsRes = await dustAPI.getSpaceGroupIds({ spaceIds });
  if (groupIdsRes.isErr()) {
    // Thrown so the cache keeps no failure, turned back into an Err by the caller.
    throw new Error(groupIdsRes.error.message);
  }

  return groupIdsRes.value;
}

const spaceGroupIdsCacheKey = (whitelistModelId: ModelId) =>
  `${whitelistModelId}`;

export const getSpaceGroupIds = cacheWithRedis(
  fetchSpaceGroupIds,
  spaceGroupIdsCacheKey,
  { ttlMs: SPACE_GROUP_IDS_CACHE_TTL_MS }
);

export async function invalidateSpaceGroupIds(
  whitelistModelId: ModelId
): Promise<void> {
  const redis = await redisClient({ origin: "cache_with_redis" });

  await redis.del(
    buildCacheWithRedisKey(
      fetchSpaceGroupIds.name,
      spaceGroupIdsCacheKey(whitelistModelId)
    )
  );
}
