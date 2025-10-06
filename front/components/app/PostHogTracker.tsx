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

const EXCLUDED_PATHS = [
  "/subscribe",
  "/poke",
  "/poke/",
  "/sso-enforced",
  "/maintenance",
  "/oauth/",
  "/share/",
];

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

  const isAdmin = currentWorkspace?.role === "admin";

  const { activeSubscription } = useWorkspaceActiveSubscription({
    owner: currentWorkspace,
    disabled: !isAdmin,
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
  const lastIdentifiedUserId = useRef<string | null>(null);
  const lastIdentifiedWorkspaceId = useRef<string | null>(null);
  const lastPlanPropertiesString = useRef<string | null>(null);

  const isExcludedPath = EXCLUDED_PATHS.some((path) => {
    const pathname = router.pathname;
    return pathname.startsWith(path) || pathname.endsWith(path);
  });
  const isTrackablePage = !isExcludedPath;

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
      before_send: (event) => {
        if (!event) {
          return null;
        }
        if (event.properties.$current_url) {
          event.properties.$current_url =
            event.properties.$current_url.split("?")[0];
        }
        if (event.properties.$pathname) {
          event.properties.$pathname = event.properties.$pathname.split("?")[0];
        }
        return event;
      },
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "*",
        recordCrossOriginIframes: false,
      },
    });
  }, []);

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

  useEffect(() => {
    if (!posthog.__loaded || !user || !hasOptedIn) {
      return;
    }

    const userChanged = lastIdentifiedUserId.current !== user.sId;

    if (userChanged) {
      const userProperties: Record<string, string> = {
        ...(workspaceId && { workspace_id: workspaceId }),
      };
      posthog.identify(user.sId, userProperties);
      lastIdentifiedUserId.current = user.sId;
    }
  }, [workspaceId, hasOptedIn, user]);

  useEffect(() => {
    if (!posthog.__loaded || !workspaceId || !hasOptedIn) {
      return;
    }

    const planPropsString = planProperties
      ? JSON.stringify(planProperties)
      : null;
    const workspaceChanged = lastIdentifiedWorkspaceId.current !== workspaceId;
    const planChanged = lastPlanPropertiesString.current !== planPropsString;

    // Set group properties when workspace changes or when plan properties are available/updated
    if (workspaceChanged || (planProperties && planChanged)) {
      posthog.group("workspace", workspaceId, planProperties ?? {});
      lastIdentifiedWorkspaceId.current = workspaceId;
      lastPlanPropertiesString.current = planPropsString;
    }
  }, [workspaceId, planProperties, hasOptedIn]);

  if (isTrackablePage && hasAcceptedCookies) {
    return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
  }

  return <>{children}</>;
}
