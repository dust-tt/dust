import type { Fetcher, SWRConfiguration } from "swr";

import type { SessionStatusResponse } from "@app/pages/api/website/session-status";

import { fetcher, useSWRWithDefaults } from "./swr";

export function useSessionStatus(
  swrOptions?: SWRConfiguration & { disabled?: boolean }
) {
  const sessionFetcher: Fetcher<SessionStatusResponse> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    "/api/website/session-status",
    sessionFetcher,
    {
      ...swrOptions,
      revalidateOnFocus: false,
    }
  );

  return {
    isLoggedIn: data?.isLoggedIn ?? false,
    user: data?.user ?? null,
    isSessionLoading: !error && !data && !swrOptions?.disabled,
    isSessionError: error,
    mutateSession: mutate,
  };
}
