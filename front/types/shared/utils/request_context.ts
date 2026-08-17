import { tryGetContext } from "hono/context-storage";

export type RequestContext = {
  method: string;
  route: string;
  url: string;
};

/**
 * Memoizes the first result for each key for the lifetime of a Hono request.
 */
export class RequestCachedQuery<Key, Value> {
  readonly cacheId = Symbol();

  get(key: Key, query: () => Promise<Value>): Promise<Value> {
    const cache = getRequestQueryCache();
    return cache ? cache.get(this, key, query) : query();
  }
}

export class RequestQueryCache {
  private readonly valuesByQuery = new Map<
    symbol,
    Map<unknown, Promise<unknown>>
  >();

  get<Key, Value>(
    query: RequestCachedQuery<Key, Value>,
    key: Key,
    load: () => Promise<Value>
  ): Promise<Value> {
    let values = this.valuesByQuery.get(query.cacheId);
    if (!values) {
      values = new Map();
      this.valuesByQuery.set(query.cacheId, values);
    }

    const cached = values.get(key);
    if (cached) {
      // A cacheId belongs to exactly one RequestCachedQuery<Key, Value>, so
      // every value stored under it has this Promise<Value> type.
      return cached as Promise<Value>;
    }

    const value = load();
    values.set(key, value);
    return value;
  }
}

export type RequestStorageEnv = {
  Variables: {
    queryCache: RequestQueryCache;
    requestContext: RequestContext;
  };
};

export function getRequestContext(): RequestContext | undefined {
  return tryGetContext<RequestStorageEnv>()?.get("requestContext");
}

export function getRequestQueryCache(): RequestQueryCache | undefined {
  return tryGetContext<RequestStorageEnv>()?.get("queryCache");
}
