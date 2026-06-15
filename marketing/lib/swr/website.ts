import {
  AUTH_CONTEXT_URL,
  type MarketingAuthContext,
} from "@marketing/lib/api/authContext";
import { useSWRWithDefaults } from "@marketing/lib/swr/swr";

type GetNoWorkspaceAuthContextResponseType = MarketingAuthContext;

// A fetcher that does NOT redirect to login on auth errors.
// The global fetcher in fetcher.ts redirects to /api/workos/login on
// "not_authenticated" responses, which is correct for the app but wrong for the
// public website — visitors with a stale session cookie should just see the
// landing page, not be forced through the login flow.
async function landingFetcher(
  url: string
): Promise<GetNoWorkspaceAuthContextResponseType> {
  // eslint-disable-next-line no-restricted-globals
  const res = await fetch(url, { credentials: "include" });
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
  const { data, error } = useSWRWithDefaults(AUTH_CONTEXT_URL, landingFetcher, {
    disabled: !hasSessionCookie,
    shouldRetryOnError: false,
  });

  return {
    user: data?.user ?? null,
    defaultWorkspaceId: data?.defaultWorkspaceId ?? null,
    isLoading: hasSessionCookie && !error && !data,
    isAuthenticated: !!data?.user,
  };
}
