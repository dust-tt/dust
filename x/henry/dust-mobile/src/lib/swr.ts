import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import type { SWRConfiguration } from "swr";

export const swrConfig: SWRConfiguration = {
  revalidateOnFocus: false, // No window focus events in RN
  revalidateOnReconnect: true,
  errorRetryCount: 3,
  dedupingInterval: 2000,
};

/**
 * Revalidate SWR data when app returns to foreground.
 */
export function useAppStateRevalidation(revalidate: () => void) {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextState === "active"
        ) {
          revalidate();
        }
        appState.current = nextState;
      }
    );

    return () => subscription.remove();
  }, [revalidate]);
}
