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
import {
  DUST_ANONYMOUS_ID_COOKIE,
  getOrCreateAnonymousId,
  getPostHogCookieDomain,
} from "@app/lib/utils/anonymous_id";
import {
  getStoredLandingContext,
  getStoredUTMParams,
  MARKETING_PARAMS,
} from "@app/lib/utils/utm";
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
];

interface PostHogTrackerProps {
  children: React.ReactNode;
  // When true, assume cookies are accepted (logged in users).
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

  const { wId } = router.query;
  const workspaceId = isString(wId) ? wId : undefined;

  // Read posthog_id from stored UTM params (sessionStorage) rather than the
  // URL, because useStripUtmParams strips it before other effects run.
  const posthogId = useMemo(() => {
    const stored = getStoredUTMParams();
    return stored.posthog_id ?? undefined;
  }, []);

  // Fetch user data whenever there is a session (or posthogId). We need the
  // user's sId for posthog.identify() in all contexts, including authenticated
  // SPAs where hasCookiesAccepted is auto-true.
  const disabled = !posthogId && !hasSession;
  const { user } = useUser({
    disabled,
  });

  const cookieValue = cookies[DUST_COOKIES_ACCEPTED];
  const hasAcceptedCookies = authenticated
    ? true
    : hasCookiesAccepted(cookieValue, user);

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

    const cookieDomain = getPostHogCookieDomain();

    // Use the persistent _dust_aid cookie as the initial distinct_id so that
    // anonymous events share a stable identity across page loads. Without this,
    // memory persistence generates a new throwaway distinct_id on every page
    // load, and only the last one gets stitched when identify() fires — all
    // prior anonymous browsing events are orphaned.
    const anonymousId = getOrCreateAnonymousId();

    posthog.init(POSTHOG_KEY, {
      api_host: `${config.getApiBaseUrl()}/subtle1`,
      person_profiles: "identified_only",
      defaults: "2025-05-24",
      persistence: "memory",
      ...(anonymousId ? { bootstrap: { distinctID: anonymousId } } : {}),
      // Share PostHog cookies (including distinct_id) across all *.dust.tt
      // subdomains so the same identity persists through dust.tt → signin →
      // app.dust.tt. Takes effect when persistence upgrades to cookie in Phase 2.
      ...(cookieDomain ? { cookie_domain: cookieDomain } : {}),
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

        // Populate PostHog's built-in "Initial UTM" person properties via
        // $set_once. The SDK auto-captures these from the URL, but since we
        // strip UTMs before PostHog sees them AND memory persistence resets
        // across page loads (dust.tt -> app.dust.tt), the SDK fills them
        // with null. Null counts as "set" for $set_once, permanently
        // locking in the wrong value, so we need to override event.$set_once.
        if (event.$set_once) {
          // Strip null $initial_* entries auto-generated by posthog-js so
          // they don't permanently claim the key with a null value.
          for (const key of Object.keys(event.$set_once)) {
            if (
              key.startsWith("$initial_") &&
              (event.$set_once[key] === null ||
                event.$set_once[key] === undefined)
            ) {
              delete event.$set_once[key];
            }
          }
        }
        // Inject stored UTM values into $set_once for initial attribution.
        const setOnceProps: Record<string, string> = {};
        for (const param of MARKETING_PARAMS) {
          const storedValue = storedParams[param];
          if (storedValue) {
            setOnceProps[`$initial_${param}`] = storedValue;
          }
        }

        // Inject first-touch landing context so the real values survive
        // the dust.tt -> signin -> app.dust.tt auth redirect flow.
        const landing = getStoredLandingContext();
        if (landing) {
          if (landing.referrer) {
            setOnceProps["$initial_referrer"] = landing.referrer;
            try {
              setOnceProps["$initial_referring_domain"] = new URL(
                landing.referrer
              ).hostname;
            } catch {
              // Malformed referrer URL.
            }
          }
          setOnceProps["$initial_host"] = landing.host;
          setOnceProps["$initial_current_url"] = landing.url;
          setOnceProps["$initial_pathname"] = landing.pathname;
        }

        if (Object.keys(setOnceProps).length > 0) {
          event.$set_once = {
            ...event.$set_once,
            ...setOnceProps,
          };
        }

        // Inject the persistent anonymous device ID from the _dust_aid cookie
        // so pre-signup events can be stitched to identified users later.
        const aidCookie = document.cookie
          .split("; ")
          .find((c) => c.startsWith(`${DUST_ANONYMOUS_ID_COOKIE}=`));
        if (aidCookie) {
          event.properties["dust_anonymous_id"] = aidCookie.split("=")[1];
        }

        // Inject referrer and user-agent as non-PII event properties.
        if (document.referrer) {
          event.properties["$referrer"] = document.referrer;
        }
        event.properties["user_agent"] = navigator.userAgent;

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

  // Identify the user as soon as possible after auth completes — NOT gated on
  // cookie consent. identify() is a first-party operation on an already-
  // authenticated user. Per PostHog support: "call PostHog.identify from your
  // front end as soon as possible after auth completes."
  //
  // This must run BEFORE the persistence upgrade (Phase 2) so that the current
  // distinct_id (the _dust_aid bootstrap value) is correctly merged with the
  // user's sId in the $identify event sent to PostHog's server.
  useEffect(() => {
    if (!posthog.__loaded || !hasInitialized.current || !user) {
      return;
    }

    if (lastIdentifiedUserId.current !== user.sId) {
      posthog.identify(user.sId);
      if (posthogId) {
        posthog.alias(user.sId, posthogId);
      }

      lastIdentifiedUserId.current = user.sId;

      // Set first-touch attribution as $set_once person properties so the
      // earliest UTM/click-ID values are permanently recorded on the profile.
      const storedParams = getStoredUTMParams();
      const firstTouchProps: Record<string, string> = {};
      for (const param of MARKETING_PARAMS) {
        const value = storedParams[param];
        if (value) {
          firstTouchProps[`first_${param}`] = value;
        }
      }

      // Include first-touch landing context.
      const landing = getStoredLandingContext();
      if (landing) {
        if (landing.referrer) {
          firstTouchProps["first_referrer"] = landing.referrer;
          try {
            firstTouchProps["first_referring_domain"] = new URL(
              landing.referrer
            ).hostname;
          } catch {
            // Malformed referrer URL.
          }
        }
        firstTouchProps["first_host"] = landing.host;
        firstTouchProps["first_landing_url"] = landing.url;
        firstTouchProps["first_landing_pathname"] = landing.pathname;
      }

      if (Object.keys(firstTouchProps).length > 0) {
        posthog.setPersonProperties({}, firstTouchProps);
      }
    }
  }, [user, posthogId]);

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
      ...(getPostHogCookieDomain()
        ? { cookie_domain: getPostHogCookieDomain() }
        : {}),
      disable_session_recording: false,
    });
    posthog.startSessionRecording();

    // Register the anonymous device ID as a super property so it persists
    // across events after persistence upgrade.
    const anonymousId = getOrCreateAnonymousId();
    if (anonymousId) {
      posthog.register({ dust_anonymous_id: anonymousId });
    }

    hasUpgradedPersistence.current = true;
  }, [hasAcceptedCookies]);

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
