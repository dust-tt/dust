import { useRouter } from "next/router";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";
import { useCookies } from "react-cookie";

import { DUST_COOKIES_ACCEPTED, hasCookiesAccepted } from "@app/lib/cookies";
import { useUser } from "@app/lib/swr/user";
import { useWorkspaceActiveSubscription } from "@app/lib/swr/workspaces";
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

  const currentWorkspace =
    user && workspaceId && "workspaces" in user
      ? user.workspaces.find((w) => w.sId === workspaceId)
      : undefined;

  const { activeSubscription } = useWorkspaceActiveSubscription({
    owner: currentWorkspace,
    disabled: !currentWorkspace,
  });

  const excludedPaths = [
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
        opt_out_capturing_by_default: true, // Opt-in only when user has accepted cookies.
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: {
          // This filters out: random div clicks, input changes, text typing to filter out noise.
          dom_event_allowlist: ["click", "submit"],
          css_selector_allowlist: ["[data-ph-capture-attribute-tracking]"],
        },
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
      const planProperties: Record<string, string> = {};
      if (activeSubscription) {
        planProperties.plan_code = activeSubscription.plan.code;
        planProperties.plan_name = activeSubscription.plan.name;
        planProperties.is_trial = activeSubscription.trialing
          ? "true"
          : "false";
      }

      const userProperties: Record<string, string> = {
        ...planProperties,
        ...(workspaceId && { workspace_id: workspaceId }),
      };
      posthog.identify(user.sId, userProperties);

      if (workspaceId) {
        posthog.group("workspace", workspaceId, planProperties);
      }
    }
  }, [
    router.pathname,
    hasAcceptedCookies,
    isTrackablePage,
    user,
    workspaceId,
    activeSubscription,
  ]);

  if (isTrackablePage && hasAcceptedCookies) {
    return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
  }

  return <>{children}</>;
}
