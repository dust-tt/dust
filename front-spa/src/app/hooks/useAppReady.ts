import { createContext, useContext, useEffect } from "react";

export const AppReadyContext = createContext<() => void>(() => {});

export function hideLoadingScreen() {
  const loading = document.getElementById("loading");
  if (!loading || loading.classList.contains("hidden")) {
    return;
  }

  loading.classList.add("hidden");
}

/**
 * Hook to signal that the component is ready to display content.
 * Call this from any component that renders meaningful content (e.g., after auth is loaded).
 * The loading screen will be dismissed when this is first called.
 */
export function useAppReady(isReady: boolean) {
  const signalReady = useContext(AppReadyContext);

  useEffect(() => {
    if (isReady) {
      signalReady();
    }
  }, [signalReady, isReady]);
}
