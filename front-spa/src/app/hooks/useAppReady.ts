import { createContext, useContext, useEffect } from "react";

// Context for signaling that the app is ready to show content
// This is used to dismiss the loading skeleton at the right time
export const AppReadyContext = createContext<() => void>(() => {});

/**
 * Hook to signal that the component is ready to display content.
 * Call this from any component that renders meaningful content (e.g., after auth is loaded).
 * The loading skeleton will be dismissed when this is first called.
 *
 * @param isReady - Optional condition. If provided, the skeleton will only be dismissed when true.
 *                  If not provided (or undefined), the skeleton is dismissed immediately on mount.
 */
export function useAppReady(isReady: boolean) {
  const signalReady = useContext(AppReadyContext);

  useEffect(() => {
    if (isReady) {
      signalReady();
    }
  }, [signalReady, isReady]);
}
