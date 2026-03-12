import { useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetNoWorkspaceAuthContextResponseType } from "@app/pages/api/auth-context";

// A fetcher that does NOT redirect to login on auth errors.
// The global fetcher in fetcher.ts redirects to /api/workos/login on
// "not_authenticated" responses, which is correct for the app but wrong for the
// public website — visitors with a stale session cookie should just see the
// landing page, not be forced through the login flow.
async function landingFetcher(
  url: string
): Promise<GetNoWorkspaceAuthContextResponseType> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }
  return res.json();
}

export function useLandingAuthContext({
  hasSessionCookie,
}: {
  hasSessionCookie: boolean;
}) {
  const { data, error } = useSWRWithDefaults(
    "/api/auth-context",
    landingFetcher,
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
