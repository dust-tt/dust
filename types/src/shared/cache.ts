import { redisClient } from "../shared/redis_client";

// Wrapper function to cache the result of a function with Redis.
// Usage:
// const cachedFn = cacheWithRedis(fn, (fnArg1, fnArg2, ...) => `${fnArg1}-${fnArg2}`, 60 * 10 * 1000);
// eslint-disable-next-line @typescript-eslint/no-explicit-any

// if caching big objects, there is a possible race condition (mulitple calls to
// caching), therefore, we use a lock
export function cacheWithRedis<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  resolver: (...args: Parameters<T>) => string,
  ttlMs: number,
  redisUri?: string,
  lockCaching?: boolean
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

    const key = `cacheWithRedis-${fn.name}-${resolver(...args)}`;

    try {
      redisCli = await redisClient({
        origin: "cache_with_redis",
        redisUri,
      });
      let cacheVal = await redisCli.get(key);
      if (cacheVal) {
        return JSON.parse(cacheVal) as Awaited<ReturnType<T>>;
      }

      if (lockCaching) {
        // if value not found, lock, recheck and set
        // we avoid locking for the first read to allow parallel calls to redis if the value is set
        await lock(key);
        cacheVal = await redisCli.get(key);
        if (cacheVal) {
          return JSON.parse(cacheVal) as Awaited<ReturnType<T>>;
        }
      }

      const result = await fn(...args);
      await redisCli.set(key, JSON.stringify(result), {
        PX: ttlMs,
      });
      return result;
    } finally {
      if (lockCaching) {
        unlock(key);
      }

      if (redisCli) {
        await redisCli.quit();
      }
    }
  };
}

const locks: Record<string, (() => void)[]> = {};

async function lock(key: string) {
  return new Promise<void>((resolve) => {
    if (locks[key]) {
      locks[key].push(resolve);
    } else {
      // use array to allow multiple locks
      // array set to empty indicates first lock
      locks[key] = [];
      resolve();
    }
  });
}

function unlock(key: string) {
  if (locks[key] === undefined) {
    throw new Error("Unreachable: unlock called without lock");
  }

  if (locks[key].length === 0) {
    delete locks[key];
    return;
  }

  const unlockFn = locks[key].pop();
  if (!unlockFn) {
    throw new Error("Unreachable: unlock called without lock");
  }
  unlockFn();
}
