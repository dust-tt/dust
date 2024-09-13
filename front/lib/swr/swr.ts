import type { PaginationState } from "@tanstack/react-table";
import { useCallback } from "react";
import type { Fetcher, Key, SWRConfiguration } from "swr";
import useSWR, { useSWRConfig } from "swr";

import { COMMIT_HASH } from "@app/lib/commit-hash";

const DEFAULT_SWR_CONFIG: SWRConfiguration = {
  errorRetryCount: 16,
};

export function useSWRWithDefaults<TKey extends Key, TData>(
  key: TKey,
  fetcher: Fetcher<TData, TKey> | null,
  config?: SWRConfiguration & { disabled?: boolean }
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

  if (disabled) {
    // When disabled, as the key is null, the mutate function is not working
    // so we need to provide a custom mutate function that will work
    return {
      ...result,
      mutate: () => {
        mutateKeysWithSameUrl(key);
        return globalMutate(key);
      },
    };
  } else {
    const myMutate: typeof result.mutate = (...args) => {
      mutateKeysWithSameUrl(key);
      return result.mutate(...args);
    };

    return {
      ...result,
      mutate: myMutate,
    };
  }
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

export const postFetcher = async ([url, body]: [string, object]) => {
  const res = await fetch(url, {
    method: "POST",
    headers: addCommitHashToHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(body),
  });

  return resHandler(res);
};

type UrlsAndOptions = { url: string; options: RequestInit };

export const fetcherMultiple = <T>(urlsAndOptions: UrlsAndOptions[]) => {
  const f = async (url: string, options: RequestInit) => fetcher(url, options);

  return Promise.all<T>(
    urlsAndOptions.map(({ url, options }) => f(url, options))
  );
};

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
