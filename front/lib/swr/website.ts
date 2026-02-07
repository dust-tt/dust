import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetNoWorkspaceAuthContextResponseType } from "@app/pages/api/auth-context";

export function useLandingAuthContext({
  hasSessionCookie,
}: {
  hasSessionCookie: boolean;
}) {
  const authContextFetcher: Fetcher<GetNoWorkspaceAuthContextResponseType> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    "/api/auth-context",
    authContextFetcher,
    {
      disabled: !hasSessionCookie,
      shouldRetryOnError: false,
    }
  );

  return {
    user: data?.user ?? null,
    isLoading: hasSessionCookie && !error && !data,
    isAuthenticated: !!data?.user,
  };
}
