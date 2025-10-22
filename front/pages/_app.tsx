// Tailwind base globals
import "@app/styles/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local tailwind components override sparkle styles
import "@app/styles/components.css";

import { datadogLogs } from "@datadog/browser-logs";
import type { NextPage } from "next";
import type { AppProps } from "next/app";

// Important: avoid destructuring process.env on the client.
// Next.js replaces direct property access (process.env.NEXT_PUBLIC_*) at build time,
// but destructuring `process.env` does not get inlined.
const NODE_ENV = process.env.NODE_ENV;
const DATADOG_CLIENT_TOKEN = process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN;
const DATADOG_SERVICE = process.env.NEXT_PUBLIC_DATADOG_SERVICE;
const COMMIT_HASH = process.env.NEXT_PUBLIC_COMMIT_HASH;

import { PostHogTracker } from "@app/components/app/PostHogTracker";
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
  // Use the layout defined at the page level, if available.
  const getLayout = Component.getLayout ?? ((page) => page);

  return (
    <PostHogTracker>
      <RootLayout>
        {getLayout(<Component {...pageProps} />, pageProps)}
      </RootLayout>
    </PostHogTracker>
  );
}
