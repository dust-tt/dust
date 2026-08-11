import config from "@marketing/lib/api/config";
import { DUST_HAS_SESSION, hasSessionIndicator } from "@marketing/lib/cookies";
import { useLandingAuthContext } from "@marketing/lib/swr/website";
import { appendUTMParams } from "@marketing/lib/utils/utm";
import { useEffect, useState } from "react";
import { useCookies } from "react-cookie";

/**
 * Resolves where a logged-in visitor should be sent when they choose to open the
 * app from the public website, along with the auth state needed to decide
 * whether to offer that at all.
 *
 * Shared by every header affordance that opens the app, so the `/api/login`
 * fallback stays in one place. SWR deduplicates the underlying auth-context
 * request across call sites, so using this hook more than once on a page costs
 * no extra network round-trip.
 */
export function useOpenDustTarget() {
  const [cookies] = useCookies([DUST_HAS_SESSION], { doNotParse: true });
  const [hasSession, setHasSession] = useState(false);

  // Check session cookie only on client to avoid hydration mismatch.
  useEffect(() => {
    setHasSession(hasSessionIndicator(cookies[DUST_HAS_SESSION]));
  }, [cookies]);

  const { user, defaultWorkspaceId, isLoading, isAuthenticated } =
    useLandingAuthContext({
      hasSessionCookie: hasSession,
    });

  // When we already know the user's workspace, navigate straight to the app to
  // skip the slow server-side `/api/login` round-trip. Fall back to `/api/login`
  // when there is no default workspace (no-workspace / first-login / invite / SSO
  // edge cases that need the full login flow).
  const target = defaultWorkspaceId
    ? appendUTMParams(`${config.getAppUrl()}/w/${defaultWorkspaceId}`)
    : appendUTMParams("/api/login");

  return { hasSession, user, isLoading, isAuthenticated, target };
}
