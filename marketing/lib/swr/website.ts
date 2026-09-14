import {
  AUTH_CONTEXT_URL,
  type MarketingAuthContext,
  resolveAuthContext,
} from "@marketing/lib/api/authContext";
import { useSWRWithDefaults } from "@marketing/lib/swr/swr";
import { assertNever } from "@marketing/types/shared/utils/assert_never";

type GetNoWorkspaceAuthContextResponseType = MarketingAuthContext;

// A fetcher that does NOT redirect to login on auth errors.
// The global fetcher in fetcher.ts redirects to /api/workos/login on
// "not_authenticated" responses, which is correct for the app but wrong for the
// public website — visitors with a stale session cookie should just see the
// landing page, not be forced through the login flow.
async function landingFetcher(
  url: string
): Promise<GetNoWorkspaceAuthContextResponseType> {
  const resolution = await resolveAuthContext(url, (target) =>
    fetch(target, { credentials: "include" })
  );

  switch (resolution.type) {
    case "success":
      return resolution.authContext;
    case "failure":
      throw new Error(`Failed to fetch ${url}: ${resolution.status}`);
    case "regional_failure":
      throw new Error(
        `Failed to fetch auth context from region ${resolution.region}: ${resolution.status}`
      );
    default:
      assertNever(resolution);
  }
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
