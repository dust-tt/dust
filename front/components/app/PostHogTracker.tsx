import { useRouter } from "next/router";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect, useMemo, useRef, useState } from "react";
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

  const planProperties = useMemo(() => {
    if (!activeSubscription) {
      return null;
    }
    return {
      plan_code: activeSubscription.plan.code,
      plan_name: activeSubscription.plan.name,
      is_trial: activeSubscription.trialing ? "true" : "false",
    };
  }, [activeSubscription]);

  const [hasOptedIn, setHasOptedIn] = useState(false);

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

  const lastIdentifiedUserId = useRef<string | null>(null);
  const lastIdentifiedWorkspaceId = useRef<string | null>(null);

  // Initialize PostHog once
  useEffect(() => {
    if (!POSTHOG_KEY || posthog.__loaded) {
      return;
    }

    posthog.init(POSTHOG_KEY, {
      api_host: "/ingest",
      person_profiles: "identified_only",
      defaults: "2025-05-24",
      opt_out_capturing_by_default: true,
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false,
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
        recordCrossOriginIframes: false,
      },
    });
  }, []);

  // Handle opt-in/opt-out based on cookies and page
  useEffect(() => {
    const shouldTrack = isTrackablePage && hasAcceptedCookies;

    if (!posthog.__loaded) {
      return;
    }

    if (shouldTrack && !hasOptedIn) {
      posthog.opt_in_capturing();
      setHasOptedIn(true);
    } else if (!shouldTrack && hasOptedIn) {
      posthog.opt_out_capturing();
      setHasOptedIn(false);
    }
  }, [isTrackablePage, hasAcceptedCookies, hasOptedIn]);

  // Handle user identification separately
  useEffect(() => {
    if (!posthog.__loaded || !user || !hasOptedIn) {
      return;
    }

    // Only identify if user changed
    if (lastIdentifiedUserId.current !== user.sId) {
      const userProperties: Record<string, string> = {
        ...(planProperties ?? {}),
        ...(workspaceId && { workspace_id: workspaceId }),
      };
      posthog.identify(user.sId, userProperties);
      lastIdentifiedUserId.current = user.sId;
    }

    // Only group if workspace changed
    if (
      workspaceId &&
      planProperties &&
      lastIdentifiedWorkspaceId.current !== workspaceId
    ) {
      posthog.group("workspace", workspaceId, planProperties);
      lastIdentifiedWorkspaceId.current = workspaceId;
    }
  }, [user, workspaceId, planProperties, hasOptedIn]);

  if (isTrackablePage && hasAcceptedCookies) {
    return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
  }

  return <>{children}</>;
}
