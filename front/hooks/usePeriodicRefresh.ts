import { useCallback, useEffect, useRef } from "react";

/**
 * Hook for triggering periodic refreshes after operations like file upload or delete.
 */
export function usePeriodicRefresh(refreshFn: () => void | Promise<any>) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const refreshCountRef = useRef<number>(0);

  const startPeriodicRefresh = useCallback(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    refreshCountRef.current = 0;

    // Start periodic refresh every 5 seconds for 30 seconds (6 attempts total)
    intervalRef.current = setInterval(() => {
      refreshCountRef.current += 1;
      void refreshFn();

      if (refreshCountRef.current >= 6) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, 5000);
  }, [refreshFn]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return { startPeriodicRefresh };
}
