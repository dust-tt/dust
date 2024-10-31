import { getAccessToken } from "@extension/lib/storage";
import { useCallback } from "react";
import type { Fetcher, Key, SWRConfiguration } from "swr";
import useSWR, { useSWRConfig } from "swr";
import type {
  SWRInfiniteConfiguration,
  SWRInfiniteKeyLoader,
} from "swr/infinite";
import useSWRInfinite from "swr/infinite";

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

  const token = await getAccessToken();
  if (!token) {
    // TODO(ext): Handle this error in a better way.
    // We want to silently refresh or redirect to login page.
    throw new Error("No access token found");
  }
  const res = await fetch(`${process.env.DUST_DOMAIN}/${url}`, {
    ...config,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return resHandler(res);
};
