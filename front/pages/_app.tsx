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

// Important: avoid destructuring process.env on the client.
// Next.js replaces direct property access (process.env.NEXT_PUBLIC_*) at build time,
// but destructuring `process.env` does not get inlined.
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const NODE_ENV = process.env.NODE_ENV;
const DATADOG_CLIENT_TOKEN = process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN;
const DATADOG_SERVICE = process.env.NEXT_PUBLIC_DATADOG_SERVICE;
const COMMIT_HASH = process.env.NEXT_PUBLIC_COMMIT_HASH;

import { useCookies } from "react-cookie";

import RootLayout from "@app/components/app/RootLayout";

if (DATADOG_CLIENT_TOKEN) {
  datadogLogs.init({
    clientToken: DATADOG_CLIENT_TOKEN,
    env: NODE_ENV === "production" ? "prod" : "dev",
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    service: `${DATADOG_SERVICE || "front"}-browser`,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    version: COMMIT_HASH || "",
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

  // Define which pages are trackable
  const excludedPaths = ["/w/", "/poke/", "/sso-enforced", "/maintenance"];
  const isTrackablePage = !excludedPaths.some((path) =>
    router.pathname.startsWith(path)
  );

  // Initialize PostHog only for trackable pages and if cookies are accepted
  useEffect(() => {
    // Disable tracking on non-trackable pages or without cookies
    if (!isTrackablePage || !hasAcceptedCookies) {
      if (posthog.__loaded) {
        posthog.opt_out_capturing();
      }
      return;
    }

    // Handle trackable pages with cookies accepted
    if (posthog.__loaded) {
      posthog.opt_in_capturing();
      return;
    }

    // Initialize PostHog if key is available
    if (POSTHOG_KEY) {
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
    }
  }, [router.pathname, hasAcceptedCookies, isTrackablePage]);

  // Use the layout defined at the page level, if available.
  const getLayout = Component.getLayout ?? ((page) => page);

  const content = (
    <RootLayout>
      {getLayout(<Component {...pageProps} />, pageProps)}
    </RootLayout>
  );

  // Only wrap with PostHogProvider for trackable pages when cookies are accepted
  if (isTrackablePage && hasAcceptedCookies) {
    return <PostHogProvider client={posthog}>{content}</PostHogProvider>;
  }

  return content;
}
