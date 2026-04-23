export { FetcherProvider, useFetcher } from "@app/lib/swr/FetcherContext";

import { isAPIErrorResponse } from "@app/types/error";
import type { PaginationState } from "@tanstack/react-table";
import { useCallback } from "react";
import type {
  Fetcher,
  Key,
  MutatorCallback,
  MutatorOptions,
  SWRConfiguration,
} from "swr";
import useSWR, { useSWRConfig } from "swr";
import type {
  SWRInfiniteConfiguration,
  SWRInfiniteKeyLoader,
} from "swr/infinite";
import useSWRInfinite, { unstable_serialize } from "swr/infinite";

const EMPTY_ARRAY = Object.freeze([]);

// Returns a frozen constant empty array of the required type- use to avoid creating new arrays
export function emptyArray<T>(): T[] {
  return EMPTY_ARRAY as unknown as T[];
}

const DEFAULT_SWR_CONFIG: SWRConfiguration = {
  errorRetryCount: 16,
};

export function useSWRWithDefaults<TKey extends Key, TData>(
  key: TKey,
  fetcher: Fetcher<TData, TKey> | null,
  config?: SWRConfiguration & {
    disabled?: boolean;
  }
) {
  const { mutate: globalMutate, cache } = useSWRConfig();

  const mergedConfig = { ...DEFAULT_SWR_CONFIG, ...config };
  const disabled = !!mergedConfig.disabled;

  const result = useSWR(disabled ? null : key, fetcher, mergedConfig);

  // If the key looks like an url, we need to remove the query params
  // to make sure we don't cache different pages together
  // Naive way to detect url by checking for '/'
  const tryMakeUrlWithoutParams = useCallback((key: TKey) => {
    if (typeof key === "string" && key.includes("/")) {
      try {
        const urlFromKey = new URL(
          key,
          key.indexOf("://") == -1 ? "https://example.org/" : undefined // We need to provide a base url to make sure the URL is parsed correctly
        );
        return urlFromKey.origin + urlFromKey.pathname;
      } catch {
        return null;
      }
    } else {
      return null;
    }
  }, []);

  const mutateKeysWithSameUrl = useCallback(
    (key: TKey) => {
      const keyAsUrl = tryMakeUrlWithoutParams(key);
      if (keyAsUrl) {
        // Cycle through all the keys in the cache that start with the same url
        // and mutate them too
        for (const k of cache.keys()) {
          const kAsUrl = tryMakeUrlWithoutParams(k as TKey);
          if (kAsUrl === keyAsUrl && k !== key) {
            void globalMutate<TData>(k);
          }
        }
      }
    },
    [tryMakeUrlWithoutParams, cache, globalMutate]
  );

  const myMutateWhenDisabled = useCallback(
    (
      data?: TData | Promise<TData> | MutatorCallback<TData> | undefined,
      options?: boolean | MutatorOptions<any, any> | undefined
    ) => {
      // When using globalMutate with undefined data or options, it does a weird visual glitch in the UI.
      // I don't really understand why.
      if (data !== undefined || options !== undefined) {
        return globalMutate(key, data, options);
      } else {
        // Using a separate globalMutate call without data or options args does not have this issue.
        return globalMutate(key);
      }
    },
    [key, globalMutate]
  );

  const myMutateWhenDisabledRegardlessOfQueryParams = useCallback(() => {
    mutateKeysWithSameUrl(key);
    return globalMutate(key);
  }, [key, mutateKeysWithSameUrl, globalMutate]);

  const myMutateRegardlessOfQueryParams: typeof result.mutate = useCallback(
    (...args) => {
      mutateKeysWithSameUrl(key);
      return result.mutate(...args);
    },
    [key, mutateKeysWithSameUrl, result]
  );

  if (disabled) {
    // When disabled, as the key is null, the mutate function is not working
    // so we need to provide a custom mutate function that will work
    return {
      ...result,
      mutate: myMutateWhenDisabled,
      mutateRegardlessOfQueryParams:
        myMutateWhenDisabledRegardlessOfQueryParams,
    };
  } else {
    return {
      ...result,
      mutateRegardlessOfQueryParams: myMutateRegardlessOfQueryParams,
    };
  }
}

export function useSWRInfiniteWithDefaults<TKey extends Key, TData>(
  getKey: SWRInfiniteKeyLoader<TData, TKey>,
  fetcher: Fetcher<TData, TKey> | null,
  config?: SWRInfiniteConfiguration & { disabled?: boolean }
) {
  const { mutate: globalMutate } = useSWRConfig();
  const mergedConfig = { ...DEFAULT_SWR_CONFIG, ...config };
  const disabled = !!mergedConfig.disabled;

  const keyLoader = useCallback(
    (pageIndex: number, previousPageData: TData | null) =>
      disabled ? null : getKey(pageIndex, previousPageData),
    [disabled, getKey]
  );

  // Returning null from an SWR Infinite key loader is documented behavior to stop pagination.
  // The cast bridges the gap between TKey and TKey|null in the type system.
  const result = useSWRInfinite<TData>(
    keyLoader as SWRInfiniteKeyLoader<TData, TKey>,
    fetcher,
    mergedConfig
  );

  const mutateWhenDisabled = useCallback(
    (
      data?:
        | TData[]
        | Promise<TData[] | undefined>
        | MutatorCallback<TData[] | undefined>,
      opts?: boolean | MutatorOptions<any, any>
    ) => {
      // When disabled, the SWR key is null so result.mutate is a no-op.
      // unstable_serialize produces the exact internal cache key useSWRInfinite uses,
      // so globalMutate correctly reaches all mounted subscribers — including for
      // optimistic updaters passed as the data argument.
      const key = unstable_serialize(getKey);
      if (data !== undefined || opts !== undefined) {
        return globalMutate(key, data, opts);
      }
      return globalMutate(key);
    },
    [getKey, globalMutate]
  );

  // Always return the same shape so the mutate type is consistent for callers.
  // When disabled, as the key is null, result.mutate is a no-op, so we replace it.
  return {
    ...result,
    mutate: (disabled
      ? mutateWhenDisabled
      : result.mutate) as typeof result.mutate,
  };
}

export const appendPaginationParams = (
  params: URLSearchParams,
  pagination?: PaginationState
) => {
  if (pagination && pagination.pageIndex) {
    params.set(
      "offset",
      (pagination.pageSize * pagination.pageIndex).toString()
    );
  }
  if (pagination && pagination.pageSize) {
    params.set("limit", pagination.pageSize.toString());
  }
};

export async function getErrorFromResponse(response: Response) {
  const errorData = await response.json();

  if (isAPIErrorResponse(errorData)) {
    /* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */
    return errorData.error.connectors_error
      ? errorData.error.connectors_error
      : errorData.error;
  }

  return { message: "An error occurred" };
}
