import NetInfo from "@react-native-community/netinfo";
import { useCallback } from "react";
import { AppState } from "react-native";
import type { Fetcher, Key, SWRConfiguration } from "swr";
import useSWR, { SWRConfig, useSWRConfig } from "swr";

import {
  DEFAULT_SWR_CONFIG,
  useDisabledMutateHelpers,
  useMutateKeysWithSameUrl,
} from "@app/shared/lib/swr-core";

// React Native SWR configuration
// See: https://swr.vercel.app/docs/advanced/react-native
export const swrReactNativeConfig: SWRConfiguration = {
  provider: () => new Map(),
  isOnline() {
    // NetInfo.fetch returns current network state
    // For synchronous check, we default to true and let revalidation handle offline
    return true;
  },
  isVisible() {
    // App is visible when in foreground
    return AppState.currentState === "active";
  },
  initFocus(callback) {
    let appState = AppState.currentState;

    const onAppStateChange = (nextAppState: typeof appState) => {
      // Trigger revalidation when app comes to foreground
      if (appState.match(/inactive|background/) && nextAppState === "active") {
        callback();
      }
      appState = nextAppState;
    };

    const subscription = AppState.addEventListener("change", onAppStateChange);

    return () => {
      subscription.remove();
    };
  },
  initReconnect(callback) {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        callback();
      }
    });

    return () => {
      unsubscribe();
    };
  },
};

/**
 * SWR hook with defaults for React Native.
 * Similar to shared/lib/swr.ts but without web-specific auth error handling
 * (mobile has its own auth error handling via AuthContext).
 */
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

  if (disabled) {
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

export { SWRConfig };
