// Memoize function with TTL.
// Usage:
// const memoizedFn = memoize(fn, (fnArg1, fnArg2, ...) => `${fnArg1}-${fnArg2}`, 10);
// The keys are evicted in LRU order after the cache reaches maxCapacity.
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  resolver: (...args: Parameters<T>) => string,
  maxCapacity: number
): T {
  const cache = new Map<string, ReturnType<T>>();

  return function (...args: Parameters<T>): ReturnType<T> {
    const key = resolver(...args);
    if (cache.has(key)) {
      const cacheHit = cache.get(key);
      if (cacheHit) {
        cache.delete(key);
        cache.set(key, cacheHit);
        return cacheHit;
      } else {
        throw new Error(
          `Cache hit but no value - this should never happen. Cache key: ${key}`
        );
      }
    }
    const result = fn(...args);
    if (cache.size) {
      if (cache.size >= maxCapacity) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
    }
    cache.set(key, result);
    return result;
  } as T;
}
