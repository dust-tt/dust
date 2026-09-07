import {
  DUST_COOKIES_ACCEPTED,
  hasCookiesAccepted,
} from "@marketing/lib/cookies";
import { useAppRouter } from "@marketing/lib/platform";
import {
  DUST_ANONYMOUS_ID_COOKIE,
  getOrCreateAnonymousId,
  getPostHogCookieDomain,
} from "@marketing/lib/utils/anonymous_id";
import {
  getStoredLandingContext,
  getStoredUTMParams,
  MARKETING_PARAMS,
} from "@marketing/lib/utils/utm";
import { isString } from "@marketing/types/shared/utils/general";
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

function isTrackablePathname(pathname: string): boolean {
  return !EXCLUDED_PATHS.some(
    (path) => pathname.startsWith(path) || pathname.endsWith(path)
  );
}

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
  const [cookies] = useCookies([DUST_COOKIES_ACCEPTED]);

  const { wId } = router.query;
  const workspaceId = isString(wId) ? wId : undefined;

  // Read posthog_id from stored UTM params (sessionStorage) rather than the
  // URL, because useStripUtmParams strips it before other effects run.
  const posthogId = useMemo(() => {
    const stored = getStoredUTMParams();
    return stored.posthog_id ?? undefined;
  }, []);

  // Marketing tracks anonymous visitors only — user identification and
  // workspace grouping live in front, which fetches the user from its own
  // SWR hooks. Marketing's PostHog stays at the device-anonymous-id level.
  type MarketingTrackerUser = {
    sId: string;
    workspaces?: { sId: string; role: string }[];
  };
  const user = null as MarketingTrackerUser | null;
  const cookieValue = cookies[DUST_COOKIES_ACCEPTED];
  const hasAcceptedCookies = authenticated
    ? true
    : hasCookiesAccepted(cookieValue, null);

  const planProperties = null as Record<string, string> | null;
  const isAdmin = false;
  const currentWorkspace = undefined as { role?: string } | undefined;

  const isTrackablePage = isTrackablePathname(router.pathname);

  const lastIdentifiedWorkspaceId = useRef<string | null>(null);
  const lastPlanPropertiesString = useRef<string | null>(null);
  const hasInitialized = useRef(false);
  const hasUpgradedPersistence = useRef(false);
  const lastIdentifiedUserId = useRef<string | null>(null);

  // Phase 1: Initialize PostHog. This captures events for all visitors,
  // including anonymous ad traffic. Visitors who have not accepted cookies get
  // sessionStorage persistence, which is cleared when the tab closes.
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

    const anonymousId = getOrCreateAnonymousId();

    // PostHog keeps the session id ($sesid) in this store, so "memory" meant a
    // new session_id on every page load and ~one pageview per session. Pick the
    // store up front rather than starting in memory and upgrading in Phase 2:
    // the Phase 2 switch clears the store it moves off, so a store we never
    // read back at init would reset the session on the next load anyway.
    const persistence = hasAcceptedCookies
      ? "localStorage+cookie"
      : "sessionStorage";

    posthog.init(POSTHOG_KEY, {
      // /subtle1 is rewritten to PostHog by marketing's own next.config.js.
      // Use a relative path so requests hit marketing's origin (not front).
      api_host: "/subtle1",
      person_profiles: "identified_only",
      defaults: "2025-05-24",
      persistence,
      // Pre-consent, use the persistent _dust_aid cookie as distinct_id so
      // anonymous events share an identity across page loads and across
      // dust.tt / app.dust.tt (sessionStorage is per-origin). Post-consent we
      // must not bootstrap: posthog-js applies bootstrap.distinctID
      // unconditionally at init, which would clobber an identified user's sId
      // back to the anonymous id on every load. PostHog's own cross-subdomain
      // cookie carries the identity there.
      ...(anonymousId && !hasAcceptedCookies
        ? { bootstrap: { distinctID: anonymousId } }
        : {}),
      // Share PostHog cookies (including distinct_id) across all *.dust.tt
      // subdomains so the same identity persists through dust.tt → signin →
      // app.dust.tt. Takes effect when persistence upgrades to cookie in Phase 2.
      ...(cookieDomain ? { cookie_domain: cookieDomain } : {}),
      // "history_change" lets posthog-js capture client-side navigations
      // itself, by patching pushState/replaceState and listening to popstate.
      // It only emits when the pathname changes, so query-only updates don't
      // produce a new $pageview. The initial page load is still captured.
      capture_pageview: "history_change",
      capture_pageleave: false,
      autocapture: false,
      disable_session_recording: true,
      property_denylist: ["$ip"],
      before_send: (event) => {
        if (!event) {
          return null;
        }

        // isTrackablePage only gates initialization; with capture_pageview:
        // "history_change" posthog-js captures client-side navigations on its
        // own, so excluded paths have to be filtered per-event.
        if (
          event.event === "$pageview" &&
          !isTrackablePathname(window.location.pathname)
        ) {
          return null;
        }

        // Inject marketing parameters from sessionStorage/cookies into every
        // event, since useStripUtmParams may have removed them from the URL
        // before PostHog saw it.
        const storedParams = getStoredUTMParams();
        for (const param of MARKETING_PARAMS) {
          const storedValue = storedParams[param];
          if (storedValue) {
            event.properties[param] = storedValue;
          }
        }

        // Populate PostHog's built-in "Initial UTM" person properties via
        // $set_once. The SDK auto-captures these from the URL, but since we
        // strip UTMs before PostHog sees them, it fills them with null. Null
        // counts as "set" for $set_once, permanently locking in the wrong
        // value, so we need to override event.$set_once.
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

        // Inject blog article classification flags from page-level meta tags.
        if (event.event === "$pageview") {
          const articleFlags = [
            ["dust:is_seo_article", "is_seo_article"],
            ["dust:is_geo_article", "is_geo_article"],
            ["dust:is_thought_leadership", "is_thought_leadership"],
          ] as const;
          for (const [metaName, propertyName] of articleFlags) {
            const meta = document.querySelector(`meta[name="${metaName}"]`);
            if (meta) {
              event.properties[propertyName] =
                meta.getAttribute("content") === "true";
            }
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
  }, [hasAcceptedCookies, isTrackablePage]);

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
  // when consent is granted mid-visit (consent banner or login). Visitors who
  // were already consented at init started there, so only the recording and
  // super-property parts do anything for them.
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

  return null;
}
