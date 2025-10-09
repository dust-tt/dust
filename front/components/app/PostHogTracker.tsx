import { useRouter } from "next/router";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect, useMemo, useRef } from "react";
import { useCookies } from "react-cookie";

import { DUST_COOKIES_ACCEPTED, hasCookiesAccepted } from "@app/lib/cookies";
import { useUser } from "@app/lib/swr/user";
import { useWorkspaceActiveSubscription } from "@app/lib/swr/workspaces";
import { isString } from "@app/types";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_INITIALIZED_KEY = "dust-ph-init";

const EXCLUDED_PATHS = [
  "/poke",
  "/poke/",
  "/sso-enforced",
  "/maintenance",
  "/oauth/",
  "/share/",
];

// In-product paths where we explicitly want to track pageviews.
// These are path suffixes after /w/[wId].
const IN_PRODUCT_PAGEVIEW_TRACKED_PATHS = ["/agent/new", "/subscribe"];

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

    const planCode = activeSubscription.plan.code;
    const planCodeUpper = planCode.toUpperCase();
    let planType = "OTHER";

    if (planCodeUpper.includes("ENT")) {
      planType = "ENTERPRISE";
    } else if (planCodeUpper.includes("PRO")) {
      planType = "PRO";
    } else if (planCodeUpper.includes("FREE")) {
      planType = "FREE";
    }

    return {
      plan_code: planCode,
      plan_name: activeSubscription.plan.name,
      plan_type: planType,
      is_trial: activeSubscription.trialing ? "true" : "false",
    };
  }, [activeSubscription]);

  const isTrackablePage = !EXCLUDED_PATHS.some((path) => {
    const pathname = router.pathname;
    return pathname.startsWith(path) || pathname.endsWith(path);
  });

  const shouldTrack = isTrackablePage && hasAcceptedCookies;

  const lastIdentifiedWorkspaceId = useRef<string | null>(null);
  const lastPlanPropertiesString = useRef<string | null>(null);
  const hasInitialized = useRef(false);

  // Initialize PostHog once
  useEffect(() => {
    if (!POSTHOG_KEY || posthog.__loaded || hasInitialized.current) {
      return;
    }

    posthog.init(POSTHOG_KEY, {
      api_host: "/ingest",
      person_profiles: "identified_only",
      defaults: "2025-05-24",
      opt_out_capturing_by_default: !shouldTrack,
      capture_pageview: true,
      capture_pageleave: false,
      autocapture: false,
      property_denylist: ["$ip"],
      before_send: (event) => {
        if (!event) {
          return null;
        }
        // Strip query parameters from URLs for privacy.
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

    hasInitialized.current = true;
  }, [shouldTrack]);

  // Handle opt-in and user identification (once per user via localStorage)
  const prevShouldTrack = useRef(shouldTrack);
  useEffect(() => {
    if (!posthog.__loaded || !hasInitialized.current) {
      return;
    }

    const trackingStateChanged = prevShouldTrack.current !== shouldTrack;
    if (!trackingStateChanged) {
      return;
    }

    if (shouldTrack) {
      const initializedUserId =
        typeof window !== "undefined"
          ? localStorage.getItem(POSTHOG_INITIALIZED_KEY)
          : null;
      const needsInitialization = user
        ? initializedUserId !== user.sId
        : !initializedUserId;

      if (needsInitialization) {
        posthog.opt_in_capturing();

        if (user) {
          posthog.identify(user.sId);
        }

        if (typeof window !== "undefined") {
          localStorage.setItem(
            POSTHOG_INITIALIZED_KEY,
            user?.sId ?? "anonymous"
          );
        }
      }
    } else {
      posthog.opt_out_capturing();
    }

    prevShouldTrack.current = shouldTrack;
  }, [shouldTrack, user]);

  // Group users by workspace and set workspace properties (admin only)
  useEffect(() => {
    if (!posthog.__loaded || !workspaceId || !shouldTrack) {
      return;
    }

    const workspaceChanged = lastIdentifiedWorkspaceId.current !== workspaceId;
    const planPropsString = JSON.stringify(planProperties);
    const planChanged = lastPlanPropertiesString.current !== planPropsString;

    if (workspaceChanged || (isAdmin && planChanged)) {
      posthog.group(
        "workspace",
        workspaceId,
        isAdmin && planProperties ? planProperties : undefined
      );
      lastIdentifiedWorkspaceId.current = workspaceId;
      if (isAdmin) {
        lastPlanPropertiesString.current = planPropsString;
      }
    }
  }, [workspaceId, planProperties, shouldTrack, isAdmin]);

  // Track pageviews on route changes.
  useEffect(() => {
    if (!posthog.__loaded || !shouldTrack) {
      return;
    }

    const handleRouteChange = () => {
      const pathname = router.pathname;

      // Track all pageviews outside /w/ + specific in-product pages
      const isInProduct = pathname.includes("/w/");
      if (isInProduct) {
        const isTrackedInProductPage = IN_PRODUCT_PAGEVIEW_TRACKED_PATHS.some(
          (path) => pathname.includes(path)
        );
        if (!isTrackedInProductPage) {
          return;
        }
      }

      posthog.capture("$pageview");
    };

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.events, router.pathname, shouldTrack]);

  if (isTrackablePage && hasAcceptedCookies) {
    return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
  }

  return <>{children}</>;
}
