import type { redisClient } from "@connectors/lib/redis";

export interface EntityRateLimiterOptions {
  redis: Awaited<ReturnType<typeof redisClient>>;
  key: string;
  windowSizeInSeconds: number;
  maxAllowed: number;
}

export async function isEntityRateLimited(
  entity: string,
  { redis, key, windowSizeInSeconds, maxAllowed }: EntityRateLimiterOptions
) {
  const currentTime = Math.floor(new Date().getTime() / 1000);
  const windowStart = currentTime - windowSizeInSeconds;

  const recentEntities = await redis.zRange(key, windowStart, currentTime, {
    BY: "SCORE",
  });

  const entityAlreadyIncluded = recentEntities.includes(entity);
  const hasReachedMaximumAllowed = recentEntities.length >= maxAllowed;

  return hasReachedMaximumAllowed && !entityAlreadyIncluded;
}

export async function addEntityToRateLimiter(
  entity: string,
  { redis, key, windowSizeInSeconds }: EntityRateLimiterOptions
): Promise<void> {
  const currentTime = Math.floor(new Date().getTime() / 1000);
  const windowStart = currentTime - windowSizeInSeconds;

  await redis.zAdd(key, [{ value: entity, score: currentTime }]);

  // Remove old entries outside of the current window.
  await redis.zRemRangeByScore(key, -Infinity, windowStart.toString());
}
