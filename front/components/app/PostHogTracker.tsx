import { useRouter } from "next/router";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";
import { useCookies } from "react-cookie";

import { DUST_COOKIES_ACCEPTED, hasCookiesAccepted } from "@app/lib/cookies";
import { useUser } from "@app/lib/swr/user";
import { isString } from "@app/types";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

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
    "/w",
    "/w/",
    "/subscribe",
    "/poke",
    "/poke/",
    "/sso-enforced",
    "/maintenance",
    "/oauth/",
    "/share/",
  ];

  const isExcludedPath = excludedPaths.some((path) => {
    const pathname = router.pathname;
    return pathname.startsWith(path) || pathname.endsWith(path);
  });
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
        property_denylist: ["$ip"],
        sanitize_properties: (properties) => {
          if (properties.$current_url) {
            properties.$current_url = properties.$current_url.split("?")[0];
          }
          if (properties.$pathname) {
            properties.$pathname = properties.$pathname.split("?")[0];
          }
          return properties;
        },
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: "*",
        },
        loaded: (posthog) => {
          posthog.opt_in_capturing();
        },
      });
    } else if (posthog.__loaded) {
      posthog.opt_in_capturing();
    }

    if (posthog.__loaded && user) {
      posthog.identify(user.sId);

      // Group by workspace
      if (workspaceId) {
        posthog.group("workspace", workspaceId);
      }
    }
  }, [router.pathname, hasAcceptedCookies, isTrackablePage, user, workspaceId]);

  if (isTrackablePage && hasAcceptedCookies) {
    return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
  }

  return <>{children}</>;
}
