import { v4 as uuidv4 } from "uuid";

import { redisClient } from "@app/lib/redis";

export async function rateLimiter(
  key: string,
  maxPerTimeframe: number,
  timeframeSeconds: number
) {
  const redis = await redisClient();
  const redisKey = `rate_limiter:${key}`;
  try {
    const zcountRes = await redis.zCount(
      redisKey,
      new Date().getTime() - timeframeSeconds * 1000,
      "+inf"
    );
    const remaining = maxPerTimeframe - zcountRes;
    if (remaining > 0) {
      await redis.zAdd(redisKey, {
        score: new Date().getTime(),
        value: uuidv4(),
      });
      await redis.expire(redisKey, timeframeSeconds * 2);
    }
    return remaining;
  } finally {
    await redis.quit();
  }
}
