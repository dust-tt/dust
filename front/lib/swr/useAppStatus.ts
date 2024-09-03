import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetAppStatusResponseBody } from "@app/pages/api/app-status";

export function useAppStatus() {
  const appStatusFetcher: Fetcher<GetAppStatusResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    "/api/app-status",
    appStatusFetcher
  );

  return {
    appStatus: useMemo(() => (data ? data : null), [data]),
    isAppStatusLoading: !error && !data,
    isAppStatusError: !!error,
  };
}
