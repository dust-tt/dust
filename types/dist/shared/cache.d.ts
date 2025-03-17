type JsonPrimitive = string | number | boolean | null;
type RecursiveJsonSerializable<T> = T extends JsonPrimitive ? T : T extends Array<infer U> ? RecursiveJsonSerializable<U>[] : T extends object ? {
    [K in keyof T]: RecursiveJsonSerializable<T[K]>;
} : never;
type IsNever<T> = [T] extends [never] ? true : false;
/**
 * Ensures that a type is strictly JSON-serializable.
 * If T is not JSON-serializable, this type resolves to 'never'.
 */
export type JsonSerializable<T> = IsNever<Exclude<RecursiveJsonSerializable<T>, T>> extends true ? T : never;
type CacheableFunction<T, Args extends unknown[]> = (...args: Args) => Promise<T>;
type KeyResolver<Args extends unknown[]> = (...args: Args) => string;
export declare function cacheWithRedis<T, Args extends unknown[]>(fn: CacheableFunction<JsonSerializable<T>, Args>, resolver: KeyResolver<Args>, ttlMs: number, redisUri?: string): (...args: Args) => Promise<JsonSerializable<T>>;
export {};
//# sourceMappingURL=cache.d.ts.map