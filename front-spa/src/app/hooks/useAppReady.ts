import { createContext, useContext, useEffect } from "react";

// Context for signaling that the app is ready to show content
// This is used to dismiss the loading skeleton at the right time
export const AppReadyContext = createContext<() => void>(() => {});

// Hides the loading screen with a fade-out animation
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
