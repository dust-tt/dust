import { useRouter } from "next/router";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";
import { useCookies } from "react-cookie";

import { DUST_COOKIES_ACCEPTED, hasCookiesAccepted } from "@app/lib/cookies";
import { useUser } from "@app/lib/swr/user";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
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
  const { hasFeature } = useFeatureFlags({
    workspaceId: workspaceId ?? "",
    disabled: !workspaceId,
  });

  const isProductRoute = router.pathname.startsWith("/w/");
  const hasPostHogFeatureFlag = hasFeature("enable_posthog");

  const excludedPaths = [
    "/poke",
    "/poke/",
    "/sso-enforced",
    "/maintenance",
    "/oauth/",
    "/share/",
  ];

  const isTrackablePage =
    !excludedPaths.some((path) => router.pathname.startsWith(path)) &&
    (!isProductRoute || hasPostHogFeatureFlag);

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
        loaded: (posthog) => {
          if (NODE_ENV === "development") {
            posthog.debug();
          }
        },
      });
    } else if (posthog.__loaded) {
      posthog.opt_in_capturing();
    }

    // Identify user if logged in
    if (posthog.__loaded && user) {
      posthog.identify(user.sId, {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      });

      // Group by workspace if we're in a product route
      if (isProductRoute && workspaceId) {
        posthog.group("workspace", workspaceId);
      }
    }
  }, [
    router.pathname,
    hasAcceptedCookies,
    isTrackablePage,
    user,
    workspaceId,
    isProductRoute,
  ]);

  // Only wrap with PostHogProvider for trackable pages when cookies are accepted
  if (isTrackablePage && hasAcceptedCookies) {
    return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
  }

  return <>{children}</>;
}
