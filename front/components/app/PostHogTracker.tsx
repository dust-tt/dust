import { useRouter } from "next/router";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";
import { useCookies } from "react-cookie";

import { DUST_COOKIES_ACCEPTED, hasCookiesAccepted } from "@app/lib/cookies";
import { useUser } from "@app/lib/swr/user";
import { isString } from "@app/types";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const NODE_ENV = process.env.NODE_ENV;

interface PostHogTrackerProps {
  children: React.ReactNode;
}

export function PostHogTracker({ children }: PostHogTrackerProps) {
  const router = useRouter();
  const [cookies] = useCookies([DUST_COOKIES_ACCEPTED]);
  const { user } = useUser();

  const cookieValue = cookies[DUST_COOKIES_ACCEPTED];
  const hasAcceptedCookies = hasCookiesAccepted(cookieValue, user);

  const { wId } = router.query;
  const workspaceId = isString(wId) ? wId : undefined;

  const excludedPaths = [
    "/poke",
    "/poke/",
    "/sso-enforced",
    "/maintenance",
    "/oauth/",
    "/share/",
  ];

  // Determine if we should enable tracking
  const isExcludedPath = excludedPaths.some((path) =>
    router.pathname.startsWith(path)
  );
  const isTrackablePage = !isExcludedPath;

  useEffect(() => {
    const shouldTrack = isTrackablePage && hasAcceptedCookies;

    if (!shouldTrack) {
      if (posthog.__loaded) {
        posthog.opt_out_capturing();
      }
      return;
    }

    if (!posthog.__loaded && POSTHOG_KEY) {
      posthog.init(POSTHOG_KEY, {
        api_host: "/ingest",
        person_profiles: "identified_only",
        defaults: "2025-05-24",
        opt_out_capturing_by_default: true, // Start opted out
        // GDPR compliance: disable IP collection
        property_denylist: ["$ip"],
        // Strip query parameters from URLs
        sanitize_properties: (properties) => {
          if (properties.$current_url) {
            properties.$current_url = properties.$current_url.split("?")[0];
          }
          if (properties.$pathname) {
            properties.$pathname = properties.$pathname.split("?")[0];
          }
          return properties;
        },
        // Session replay settings for GDPR compliance
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: "*",
        },
        loaded: (posthog) => {
          if (NODE_ENV === "development") {
            posthog.debug();
          }
          // Opt in after initialization since shouldTrack is true
          posthog.opt_in_capturing();
        },
      });
    } else if (posthog.__loaded) {
      posthog.opt_in_capturing();
    }

    // Identify user if tracking is enabled and user exists
    // GDPR compliance: only use internal user ID, no email or names
    if (posthog.__loaded && user) {
      posthog.identify(user.sId);

      // Group by workspace
      if (workspaceId) {
        posthog.group("workspace", workspaceId);
      }
    }
  }, [router.pathname, hasAcceptedCookies, isTrackablePage, user, workspaceId]);

  // Only wrap with PostHogProvider when tracking is enabled
  if (isTrackablePage && hasAcceptedCookies) {
    return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
  }

  return <>{children}</>;
}
