import type { Cache, Key, MutatorCallback, SWRConfiguration } from "swr";
import { useCallback } from "react";

export const DEFAULT_SWR_CONFIG: SWRConfiguration = {
  errorRetryCount: 16,
};

/**
 * Attempts to extract URL without query params from a cache key.
 * Returns null if key is not a URL-like string.
 */
export function tryMakeUrlWithoutParams<TKey extends Key>(
  key: TKey
): string | null {
  if (typeof key === "string" && key.includes("/")) {
    try {
      const urlFromKey = new URL(
        key,
        key.indexOf("://") == -1 ? "https://example.org/" : undefined
      );
      return urlFromKey.origin + urlFromKey.pathname;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Creates a function that mutates all cache keys with the same URL (ignoring query params).
 */
export function useMutateKeysWithSameUrl<TKey extends Key, TData>(
  cache: Cache,
  globalMutate: <T>(
    key: Key,
    data?: T | Promise<T> | MutatorCallback<T>
  ) => Promise<T | undefined>
) {
  return useCallback(
    (key: TKey) => {
      const keyAsUrl = tryMakeUrlWithoutParams(key);
      if (keyAsUrl) {
        for (const k of cache.keys()) {
          const kAsUrl = tryMakeUrlWithoutParams(k as TKey);
          if (kAsUrl === keyAsUrl && k !== key) {
            void globalMutate<TData>(k);
          }
        }
      }
    },
    [cache, globalMutate]
  );
}

/**
 * Creates mutate helper functions for disabled state.
 */
export function useDisabledMutateHelpers<TKey extends Key>(
  key: TKey,
  globalMutate: <T>(
    key: Key,
    data?: T | Promise<T> | MutatorCallback<T>
  ) => Promise<T | undefined>,
  mutateKeysWithSameUrl: (key: TKey) => void
) {
  const myMutateWhenDisabled = useCallback(() => {
    return globalMutate(key);
  }, [key, globalMutate]);

  const myMutateWhenDisabledRegardlessOfQueryParams = useCallback(() => {
    mutateKeysWithSameUrl(key);
    return globalMutate(key);
  }, [key, mutateKeysWithSameUrl, globalMutate]);

  return {
    myMutateWhenDisabled,
    myMutateWhenDisabledRegardlessOfQueryParams,
  };
}
