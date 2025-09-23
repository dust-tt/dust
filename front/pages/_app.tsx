// Tailwind base globals
import "@app/styles/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local tailwind components override sparkle styles
import "@app/styles/components.css";

import { datadogLogs } from "@datadog/browser-logs";
import type { NextPage } from "next";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";
import { useCookies } from "react-cookie";

import RootLayout from "@app/components/app/RootLayout";

if (process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN) {
  datadogLogs.init({
    clientToken: process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN,
    env: process.env.NODE_ENV === "production" ? "prod" : "dev",
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    service: `${process.env.NEXT_PUBLIC_DATADOG_SERVICE || "front"}-browser`,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    version: process.env.NEXT_PUBLIC_COMMIT_HASH || "",
    site: "datadoghq.eu",
    forwardErrorsToLogs: true,
    sessionSampleRate: 100,
  });
}

export type NextPageWithLayout<P = unknown, IP = P> = NextPage<P, IP> & {
  getLayout?: (
    page: React.ReactElement,
    pageProps: AppProps
  ) => React.ReactNode;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

export default function App({ Component, pageProps }: AppPropsWithLayout) {
  const router = useRouter();
  const [cookies] = useCookies(["dust-cookies-accepted"]);

  // Check if user has accepted cookies
  const cookieValue = cookies["dust-cookies-accepted"];
  const hasAcceptedCookies =
    cookieValue === "true" || cookieValue === "auto" || cookieValue === true;

  // Initialize PostHog only for public pages (not under /w/) and if cookies are accepted
  useEffect(() => {
    const isPublicPage = !router.pathname.startsWith("/w/");

    // Add global debug function for testing in browser console
    if (typeof window !== "undefined") {
      (window as any).debugPostHog = () => {
        const status = {
          loaded: posthog.__loaded,
          capturing: posthog.__loaded ? posthog.is_capturing() : false,
          distinctId: posthog.__loaded ? posthog.get_distinct_id() : null,
          sessionId: posthog.__loaded ? posthog.get_session_id() : null,
          config: posthog.config,
          hasKey: !!process.env.NEXT_PUBLIC_POSTHOG_KEY,
        };
        console.log("[PostHog Debug]", status);
        return status;
      };

      (window as any).testPostHogEvent = () => {
        if (posthog.__loaded) {
          posthog.capture("debug_test_event", {
            timestamp: new Date().toISOString(),
            test: true,
          });
          console.log("[PostHog] Test event sent");
        } else {
          console.error("[PostHog] Not loaded");
        }
      };
    }

    // Enhanced logging for PostHog initialization
    console.log("[PostHog] Initialization check:", {
      pathname: router.pathname,
      isPublicPage,
      hasAcceptedCookies,
      cookieValue: cookies["dust-cookies-accepted"],
      posthogLoaded: posthog.__loaded,
      hasPostHogKey: !!process.env.NEXT_PUBLIC_POSTHOG_KEY,
      environment: process.env.NODE_ENV,
    });

    if (isPublicPage && hasAcceptedCookies) {
      // Only initialize if not already initialized
      if (!posthog.__loaded && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
        console.log("[PostHog] Initializing with key:", process.env.NEXT_PUBLIC_POSTHOG_KEY.substring(0, 10) + "...");

        posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
          api_host: "/ingest",
          person_profiles: "identified_only",
          defaults: "2025-05-24",
          loaded: (posthog) => {
            console.log("[PostHog] Successfully loaded", {
              isCapturing: posthog.is_capturing(),
              distinctId: posthog.get_distinct_id(),
              sessionId: posthog.get_session_id(),
            });

            if (process.env.NODE_ENV === "development") {
              posthog.debug();
            }
          },
        });

        // Log when events are captured
        posthog.on("eventCaptured", (event) => {
          console.log("[PostHog] Event captured:", event);
        });

      } else if (posthog.__loaded) {
        console.log("[PostHog] Re-enabling capturing (already initialized)");
        // Re-enable capturing if previously opted out
        posthog.opt_in_capturing();
      } else {
        console.log("[PostHog] Skipped initialization - no key available");
      }
    } else {
      // Opt out of capturing if on webapp pages or cookies not accepted
      if (posthog.__loaded) {
        console.log("[PostHog] Opting out of capturing", { isPublicPage, hasAcceptedCookies });
        posthog.opt_out_capturing();
      } else {
        console.log("[PostHog] Not loaded, cannot opt out", { isPublicPage, hasAcceptedCookies });
      }
    }
  }, [router.pathname, hasAcceptedCookies]);

  // Track page views
  useEffect(() => {
    const handleRouteChange = (url: string) => {
      if (posthog.__loaded && posthog.is_capturing()) {
        console.log("[PostHog] Capturing pageview:", url);
        posthog.capture("$pageview");
      } else {
        console.log("[PostHog] Not capturing pageview:", {
          url,
          loaded: posthog.__loaded,
          capturing: posthog.__loaded ? posthog.is_capturing() : false,
        });
      }
    };

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.events]);

  // Use the layout defined at the page level, if available.
  const getLayout = Component.getLayout ?? ((page) => page);

  const content = (
    <RootLayout>
      {getLayout(<Component {...pageProps} />, pageProps)}
    </RootLayout>
  );

  // Only wrap with PostHogProvider for public pages when cookies are accepted
  if (!router.pathname.startsWith("/w/") && hasAcceptedCookies) {
    return <PostHogProvider client={posthog}>{content}</PostHogProvider>;
  }

  return content;
}
