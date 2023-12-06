import { redisClient } from "../shared/redis_client";

// Wrapper function to cache the result of a function with Redis.
// Usage:
// const cachedFn = cacheWithRedis(fn, (fnArg1, fnArg2, ...) => `${fnArg1}-${fnArg2}`, 60 * 10 * 1000);
export function cacheWithRedis<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  resolver: (...args: Parameters<T>) => string,
  ttlMs: number,
  redisUrl?: string
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
  if (!redisUrl) {
    const REDIS_CACHE_URL = process.env.REDIS_CACHE_URL;
    if (!REDIS_CACHE_URL) {
      throw new Error("REDIS_CACHE_URL is not set");
    }
    redisUrl = REDIS_CACHE_URL;
  }

  return async function (...args: Parameters<T>) {
    if (!redisUrl) {
      throw new Error("redisUrl is not set");
    }
    const a: ReturnType<T> | undefined = undefined;
    let redisCli: Awaited<ReturnType<typeof redisClient>> | undefined =
      undefined;

    try {
      redisCli = await redisClient(redisUrl);
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
