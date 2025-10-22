import { useCallback, useEffect, useRef } from "react";

/**
 * Hook for triggering periodic refreshes after operations like file upload or delete.
 * @param refreshFn - Function to call for refreshing
 * @param intervalMs - Time between refreshes in milliseconds (default: 5000ms)
 * @param totalDurationMs - Total time to keep refreshing in milliseconds (default: 30000ms)
 */
export function usePeriodicRefresh(
  refreshFn: () => void | Promise<any>,
  intervalMs: number = 5000,
  totalDurationMs: number = 30000
) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const refreshCountRef = useRef<number>(0);

  const startPeriodicRefresh = useCallback(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    refreshCountRef.current = 0;
    const maxAttempts = Math.ceil(totalDurationMs / intervalMs);

    // Start periodic refresh
    intervalRef.current = setInterval(() => {
      refreshCountRef.current += 1;
      void refreshFn();

      if (refreshCountRef.current >= maxAttempts) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, intervalMs);
  }, [refreshFn, intervalMs, totalDurationMs]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return { startPeriodicRefresh };
}
