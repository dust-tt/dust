import NetInfo from "@react-native-community/netinfo";
import { useCallback } from "react";
import { AppState } from "react-native";
import type { Fetcher, Key, SWRConfiguration } from "swr";
import useSWR, { SWRConfig, useSWRConfig } from "swr";

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

  const tryMakeUrlWithoutParams = useCallback((key: TKey) => {
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
    } else {
      return null;
    }
  }, []);

  const mutateKeysWithSameUrl = useCallback(
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
