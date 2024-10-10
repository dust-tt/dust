import { redisClient } from "../shared/redis_client";

// Wrapper function to cache the result of a function with Redis.
// Usage:
// const cachedFn = cacheWithRedis(fn, (fnArg1, fnArg2, ...) => `${fnArg1}-${fnArg2}`, 60 * 10 * 1000);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cacheWithRedis<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  resolver: (...args: Parameters<T>) => string,
  ttlMs: number,
  redisUri?: string
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
  if (ttlMs > 60 * 60 * 24 * 1000) {
    throw new Error("ttlMs should be less than 24 hours");
  }

  return async function (...args: Parameters<T>) {
    if (!redisUri) {
      const REDIS_CACHE_URI = process.env.REDIS_CACHE_URI;
      if (!REDIS_CACHE_URI) {
        throw new Error("REDIS_CACHE_URI is not set");
      }
      redisUri = REDIS_CACHE_URI;
    }
    let redisCli: Awaited<ReturnType<typeof redisClient>> | undefined =
      undefined;

    try {
      redisCli = await redisClient({
        origin: "cache_with_redis",
        redisUri,
      });
      const key = `cacheWithRedis-${fn.name}-${resolver(...args)}`;
      const cacheVal = await redisCli.get(key);
      if (cacheVal) {
        return JSON.parse(cacheVal) as Awaited<ReturnType<T>>;
      }

      const result = await fn(...args);
      await redisCli.set(key, JSON.stringify(result), {
        PX: ttlMs,
      });

      return result;
    } finally {
      if (redisCli) {
        await redisCli.quit();
      }
    }
  };
}
