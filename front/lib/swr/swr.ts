import type { PaginationState } from "@tanstack/react-table";
import { useCallback } from "react";
import type { Fetcher, Key, SWRConfiguration } from "swr";
import useSWR, { useSWRConfig } from "swr";
import type {
  SWRInfiniteConfiguration,
  SWRInfiniteKeyLoader,
} from "swr/infinite";
import useSWRInfinite from "swr/infinite";

import { COMMIT_HASH } from "@app/lib/commit-hash";
import { isAPIErrorResponse, safeParseJSON } from "@app/types";

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

  const myMutateWhenDisabled = useCallback(() => {
    return globalMutate(key);
  }, [key, globalMutate]);

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
  config?: SWRInfiniteConfiguration
) {
  const mergedConfig = { ...DEFAULT_SWR_CONFIG, ...config };
  return useSWRInfinite<TData>(getKey, fetcher, mergedConfig);
}

const addCommitHashToHeaders = (headers: HeadersInit = {}): HeadersInit => ({
  ...headers,
  "X-Commit-Hash": COMMIT_HASH,
});

const resHandler = async (res: Response) => {
  if (res.status >= 300) {
    const errorText = await res.text();
    console.error(
      "Error returned by the front API: ",
      res.status,
      res.headers,
      errorText
    );

    const parseRes = safeParseJSON(errorText);
    if (parseRes.isOk()) {
      if (isAPIErrorResponse(parseRes.value)) {
        throw parseRes.value;
      }
    }

    throw new Error(errorText);
  }
  return res.json();
};

export const fetcher = async (...args: Parameters<typeof fetch>) => {
  const [url, config] = args;
  const res = await fetch(url, {
    ...config,
    headers: addCommitHashToHeaders(config?.headers),
  });
  return resHandler(res);
};

export const fetcherWithBody = async ([url, body, method]: [
  string,
  object,
  string,
]) => {
  const res = await fetch(url, {
    method,
    headers: addCommitHashToHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(body),
  });

  return resHandler(res);
};

type UrlsAndOptions = { url: string; options: RequestInit };

const fetcherMultiple = <T>(urlsAndOptions: UrlsAndOptions[]) => {
  const f = async (url: string, options: RequestInit) => fetcher(url, options);

  return Promise.all<T>(
    urlsAndOptions.map(({ url, options }) => f(url, options))
  );
};

const appendPaginationParams = (
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
    return errorData.error.connectors_error
      ? errorData.error.connectors_error
      : errorData.error;
  }

  return { message: "An error occurred" };
}
