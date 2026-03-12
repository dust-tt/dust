import config from "@app/lib/api/config";
import {
  DUST_COOKIES_ACCEPTED,
  DUST_HAS_SESSION,
  hasCookiesAccepted,
  hasSessionIndicator,
} from "@app/lib/cookies";
import { useAppRouter } from "@app/lib/platform";
import { useUser } from "@app/lib/swr/user";
import { useWorkspaceActiveSubscription } from "@app/lib/swr/workspaces";
import { getStoredUTMParams, MARKETING_PARAMS } from "@app/lib/utils/utm";
import { isString } from "@app/types/shared/utils/general";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect, useMemo, useRef } from "react";
import { useCookies } from "react-cookie";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

const EXCLUDED_PATHS = [
  "/poke",
  "/poke/",
  "/sso-enforced",
  "/maintenance",
  "/oauth/",
  "/share/",
];

interface PostHogTrackerProps {
  children: React.ReactNode;
  // When true, skip fetching user data and assume cookies are accepted.
  // Use in authenticated contexts (e.g. SPA) where the user is always logged in.
  authenticated?: boolean;
}

export function PostHogTracker({
  children,
  authenticated,
}: PostHogTrackerProps) {
  // Always render PostHogProvider to avoid unmounting/remounting the entire
  // tree when tracking state changes. Tracking is controlled via
  // posthog.opt_in_capturing() / posthog.opt_out_capturing() instead.
  return (
    <PostHogProvider client={posthog}>
      <PostHogTrackerInner authenticated={authenticated} />
      {children}
    </PostHogProvider>
  );
}

/**
 * Inner component that handles all PostHog side-effects (initialization,
 * identification, opt-in/opt-out, workspace grouping, pageview tracking).
 * Separated from PostHogTracker so that user/subscription loading never
 * affects the children tree structure.
 */
interface PostHogTrackerInnerProps {
  authenticated?: boolean;
}

function PostHogTrackerInner({ authenticated }: PostHogTrackerInnerProps) {
  const router = useAppRouter();
  const [cookies] = useCookies([DUST_COOKIES_ACCEPTED, DUST_HAS_SESSION]);
  const hasSession = hasSessionIndicator(cookies[DUST_HAS_SESSION]);

  // Skip useUser in authenticated contexts — user is always logged in so
  // hasCookiesAccepted is always true and we don't need user data for consent.
  const { user } = useUser({
    disabled: !!authenticated || !hasSession,
  });

  const cookieValue = cookies[DUST_COOKIES_ACCEPTED];
  const hasAcceptedCookies = authenticated
    ? true
    : hasCookiesAccepted(cookieValue, user);

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

  const lastIdentifiedWorkspaceId = useRef<string | null>(null);
  const lastPlanPropertiesString = useRef<string | null>(null);
  const hasInitialized = useRef(false);
  const hasUpgradedPersistence = useRef(false);
  const lastIdentifiedUserId = useRef<string | null>(null);

  // Phase 1: Initialize PostHog with memory-only persistence (no cookies).
  // This captures events for all visitors including anonymous ad traffic,
  // without setting any cookies or using localStorage (GDPR-compliant).
  useEffect(() => {
    if (
      !POSTHOG_KEY ||
      !isTrackablePage ||
      posthog.__loaded ||
      hasInitialized.current
    ) {
      return;
    }

    posthog.init(POSTHOG_KEY, {
      api_host: `${config.getApiBaseUrl()}/subtle1`,
      person_profiles: "identified_only",
      defaults: "2025-05-24",
      persistence: "memory",
      capture_pageview: true,
      capture_pageleave: false,
      autocapture: false,
      disable_session_recording: true,
      property_denylist: ["$ip"],
      before_send: (event) => {
        if (!event) {
          return null;
        }

        // Inject marketing parameters from sessionStorage/cookies into every
        // event. This is needed because memory persistence can't auto-capture
        // UTM params across page loads, and URLs may have been stripped by
        // useStripUtmParams.
        const storedParams = getStoredUTMParams();
        for (const param of MARKETING_PARAMS) {
          const storedValue = storedParams[param];
          if (storedValue) {
            event.properties[param] = storedValue;
          }
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
  }, [isTrackablePage]);

  // Phase 2: Upgrade to full cookie persistence and enable session recording
  // once the user has accepted cookies (consent banner or login).
  useEffect(() => {
    if (
      !posthog.__loaded ||
      !hasInitialized.current ||
      !hasAcceptedCookies ||
      hasUpgradedPersistence.current
    ) {
      return;
    }

    posthog.set_config({
      persistence: "localStorage+cookie",
      disable_session_recording: false,
    });
    posthog.startSessionRecording();
    hasUpgradedPersistence.current = true;
  }, [hasAcceptedCookies]);

  // Identify user after consent is given. Handles both cases:
  // consent-then-login and login-then-consent.
  useEffect(() => {
    if (
      !posthog.__loaded ||
      !hasInitialized.current ||
      !hasAcceptedCookies ||
      !user
    ) {
      return;
    }

    if (lastIdentifiedUserId.current !== user.sId) {
      posthog.identify(user.sId);
      lastIdentifiedUserId.current = user.sId;
    }
  }, [hasAcceptedCookies, user]);

  // Group users by workspace and set workspace properties (admin only).
  const lastUserRole = useRef<string | null>(null);
  useEffect(() => {
    if (!posthog.__loaded || !workspaceId || !hasAcceptedCookies) {
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

    // Track user role as a person property (updates when workspace changes).
    const userRole = currentWorkspace?.role ?? null;
    if (userRole && userRole !== lastUserRole.current) {
      posthog.setPersonProperties({ user_role: userRole });
      lastUserRole.current = userRole;
    }
  }, [
    workspaceId,
    planProperties,
    hasAcceptedCookies,
    isAdmin,
    currentWorkspace?.role,
  ]);

  // Track pageviews on route changes.
  useEffect(() => {
    if (!posthog.__loaded || !isTrackablePage) {
      return;
    }

    const handleRouteChange = () => {
      const pathname = router.pathname;

      // Don't track pageviews on conversation pages (/conversation/[cId]), but track /conversation/new.
      const isConversationPage = /\/conversation\/(?!new$)[^/]+$/.test(
        pathname
      );
      if (isConversationPage) {
        return;
      }

      posthog.capture("$pageview");
    };

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.events, router.pathname, isTrackablePage]);

  return null;
}
