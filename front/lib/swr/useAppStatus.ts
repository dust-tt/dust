import type { AppStatus } from "@app/lib/api/status";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { Fetcher } from "swr";

export function useAppStatus() {
  const { fetcher } = useFetcher();
  const appStatusFetcher: Fetcher<AppStatus> = fetcher;

  const { data, error } = useSWRWithDefaults(
    "/api/app-status",
    appStatusFetcher,
    {
      refreshInterval: 5 * 60 * 1000, // Poll every 5 minutes.
      focusThrottleInterval: 30 * 60 * 1000, // Throttle focus revalidation to 30 minutes.
      revalidateOnReconnect: false,
      dedupingInterval: 5 * 60 * 1000, // Dedupe identical requests within 5 minutes.
    }
  );

  return {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    appStatus: data ? data : null,
    isAppStatusLoading: !error && !data,
    isAppStatusError: !!error,
  };
}
