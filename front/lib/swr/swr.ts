import type { Fetcher, Key, SWRConfiguration } from "swr";
import useSWR, { useSWRConfig } from "swr";

import { COMMIT_HASH } from "@app/lib/commit-hash";

export const SWR_KEYS = {
  vaults: (workspaceId: string) => `/api/w/${workspaceId}/vaults`,
  conversations: (workspaceId: string) => `/api/w/${workspaceId}/conversations`,
};

const DEFAULT_SWR_CONFIG: SWRConfiguration = {
  errorRetryCount: 16,
};

export function useSWRWithDefaults<TKey extends Key, TData>(
  key: TKey,
  fetcher: Fetcher<TData, TKey> | null,
  config?: SWRConfiguration & { disabled?: boolean }
) {
  const { mutate: globalMutate } = useSWRConfig();

  const mergedConfig = { ...DEFAULT_SWR_CONFIG, ...config };
  const disabled = !!mergedConfig.disabled;

  const result = useSWR(disabled ? null : key, fetcher, mergedConfig);

  if (disabled) {
    // When disabled, as the key is null, the mutate function is not working
    // so we need to provide a custom mutate function that will work
    return { ...result, mutate: () => globalMutate(key) };
  } else {
    return result;
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
