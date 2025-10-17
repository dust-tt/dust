import type { Fetcher } from "swr";

import type { AppStatus } from "@app/lib/api/status";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";

export function useAppStatus() {
  const appStatusFetcher: Fetcher<AppStatus> = fetcher;

  const { data, error } = useSWRWithDefaults(
    "/api/app-status",
    appStatusFetcher,
    {
      focusThrottleInterval: 10 * 60 * 1000, // 10 minutes
    }
  );

  return {
    appStatus: data ? data : null,
    isAppStatusLoading: !error && !data,
    isAppStatusError: !!error,
  };
}
