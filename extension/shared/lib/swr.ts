import { useAuthErrorCheck } from "@app/ui/hooks/useAuthErrorCheck";
import { useCallback } from "react";
import type { Fetcher, Key, SWRConfiguration } from "swr";
import useSWR, { useSWRConfig } from "swr";

import {
  DEFAULT_SWR_CONFIG,
  useDisabledMutateHelpers,
  useMutateKeysWithSameUrl,
} from "./swr-core";

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

  const mutateKeysWithSameUrl = useMutateKeysWithSameUrl<TKey, TData>(
    cache,
    globalMutate
  );

  const { myMutateWhenDisabled, myMutateWhenDisabledRegardlessOfQueryParams } =
    useDisabledMutateHelpers(key, globalMutate, mutateKeysWithSameUrl);

  const myMutateRegardlessOfQueryParams: typeof result.mutate = useCallback(
    (...args) => {
      mutateKeysWithSameUrl(key);
      return result.mutate(...args);
    },
    [key, mutateKeysWithSameUrl, result]
  );

  useAuthErrorCheck(
    result.error,
    disabled ? myMutateWhenDisabled : result.mutate
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

export const resHandler = async (res: Response) => {
  if (res.status < 300) {
    return res.json();
  }

  let error;

  try {
    const resJson = await res.json();
    error = resJson.error;

    if (error?.type === "not_authenticated") {
      error = error.message;
    }
  } catch (e) {
    console.error("Error parsing response: ", e);
    error = await res.text();
  }

  console.error(
    "Error returned by the front API: ",
    res.status,
    res.headers,
    error
  );
  throw new Error(error);
};
