export type RequestContext = {
  method: string;
  route: string;
  url: string;
};

export type RequestStorage = {
  queryCache: RequestQueryCache;
  requestContext: RequestContext;
};

type RequestStorageResolver = () => RequestStorage | undefined;

let requestStorageResolver: RequestStorageResolver | null = null;

/**
 * Installs the request storage adapter owned by the application runtime.
 */
export function setRequestStorageResolver(
  resolver: RequestStorageResolver | null
): void {
  requestStorageResolver = resolver;
}

function getRequestStorage(): RequestStorage | undefined {
  return requestStorageResolver?.();
}

/**
 * Memoizes the first result for each key for the lifetime of a request.
 */
export class RequestCachedQuery<Key, Value> {
  readonly cacheId = Symbol();

  get(key: Key, query: () => Promise<Value>): Promise<Value> {
    const cache = getRequestStorage()?.queryCache;
    return cache ? cache.get(this, key, query) : query();
  }

  /** Forgets the memoized value for one key, so the next read in this request reloads. */
  invalidate(key: Key): void {
    getRequestStorage()?.queryCache.invalidate(this, key);
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

  invalidate<Key, Value>(
    query: RequestCachedQuery<Key, Value>,
    key: Key
  ): void {
    this.valuesByQuery.get(query.cacheId)?.delete(key);
  }
}

export function getRequestContext(): RequestContext | undefined {
  return getRequestStorage()?.requestContext;
}
