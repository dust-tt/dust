// Memoize function with TTL.
// Usage:
// const memoizedFn = memoize(fn, (fnArg1, fnArg2, ...) => `${fnArg1}-${fnArg2}`, 60 * 10 * 1000);
// Cache expires after ttlMs since last usage of the memoized function.
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  resolver: (...args: Parameters<T>) => string,
  ttlMs: number
): T {
  const cache = new Map<string, ReturnType<T>>();
  let ttlTimeout: NodeJS.Timeout | undefined = undefined;

  const extendTTL = () => {
    clearTimeout(ttlTimeout);
    ttlTimeout = setTimeout(() => {
      cache.clear();
    }, ttlMs);
  };
  extendTTL();
  return function (...args: Parameters<T>): ReturnType<T> {
    extendTTL();

    const key = resolver(...args);
    if (cache.has(key)) {
      const cacheHit = cache.get(key);
      if (cacheHit) {
        return cacheHit;
      } else {
        throw new Error(
          `Cache hit but no value - this should never happen. Cache key: ${key}`
        );
      }
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  } as T;
}
