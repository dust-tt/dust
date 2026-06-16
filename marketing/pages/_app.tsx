// Tailwind base globals
import "@marketing/styles/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local tailwind components override sparkle styles
import "@marketing/styles/components.css";

import type { NextPage } from "next";
import type { AppProps } from "next/app";
import dynamic from "next/dynamic";

// Important: avoid destructuring process.env on the client.
// Next.js replaces direct property access (process.env.NEXT_PUBLIC_*) at build time,
// but destructuring `process.env` does not get inlined.
const NODE_ENV = process.env.NODE_ENV;
const DATADOG_CLIENT_TOKEN = process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN;
const DATADOG_SERVICE = process.env.NEXT_PUBLIC_DATADOG_SERVICE;
const COMMIT_HASH = process.env.NEXT_PUBLIC_COMMIT_HASH;

const CONSOLE_MESSAGE_SHOWN_KEY = "dust_console_message_shown";

// PostHogTracker calls useRouter at the top level, which throws during static
// prerendering. Load it client-side only.
const PostHogTracker = dynamic(
  () =>
    import("@marketing/components/app/PostHogTracker").then(
      (m) => m.PostHogTracker
    ),
  { ssr: false }
);
import { NextLinkWrapper } from "@marketing/components/platform/NextLinkWrapper";
import { FetcherProvider } from "@marketing/components/swr/FetcherContext";
import { fetcher, fetcherWithBody } from "@marketing/lib/swr/fetcher";
import { initDatadogLogs } from "@marketing/logger/datadogLogger";
import { SparkleContext } from "@dust-tt/sparkle";
import { useMemo } from "react";

if (DATADOG_CLIENT_TOKEN) {
  initDatadogLogs({
    clientToken: DATADOG_CLIENT_TOKEN,
    env: NODE_ENV === "production" ? "prod" : "dev",
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    service: `${DATADOG_SERVICE || "front"}-browser`,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    version: COMMIT_HASH || "",
  });
}

// Developer console recruitment message.
if (
  typeof window !== "undefined" &&
  typeof console !== "undefined" &&
  NODE_ENV === "production"
) {
  (() => {
    try {
      const alreadyShown = localStorage.getItem(CONSOLE_MESSAGE_SHOWN_KEY);
      if (!alreadyShown) {
        localStorage.setItem(CONSOLE_MESSAGE_SHOWN_KEY, "true");

        console.log(
          "%c" +
            "██████╗ ██╗   ██╗███████╗████████╗\n" +
            "██╔══██╗██║   ██║██╔════╝╚══██╔══╝\n" +
            "██║  ██║██║   ██║███████╗   ██║   \n" +
            "██║  ██║██║   ██║╚════██║   ██║   \n" +
            "██████╔╝╚██████╔╝███████║   ██║   \n" +
            "╚═════╝  ╚═════╝ ╚══════╝   ╚═╝   ",
          "color: #54B47D; font-family: monospace; font-size: 12px; font-weight: bold;"
        );

        console.log(
          "%c🚀 Hey there, curious developer!",
          "color: #418B5C; font-size: 20px; font-weight: bold; margin: 10px 0;"
        );

        console.log(
          "%cWe're creating a new AI operating system that has the potential to change how companies operate.\n\n" +
            "Our mission at Dust is to transform how work gets done by letting any team\n" +
            "and employee shape the exact agents they need to accelerate their jobs.\n\n" +
            "Want to help us build this future? We're looking for talented engineers who:\n" +
            "  • Are passionate about crafting rock-solid code and exceptional experiences at warp speed.\n" +
            "  • Want to shape the future of work with AI\n\n" +
            "Join us \\o/",
          "color: #0A361A; font-size: 14px; line-height: 1.6;"
        );

        console.log(
          "%c👉 Learn more about us: %chttps://dust.tt/home/about",
          "color: #277644; font-size: 16px; font-weight: bold;",
          "color: #54B47D; font-size: 16px; font-weight: bold; text-decoration: underline;"
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
    } catch (e) {
      // Silently fail if localStorage is not available or throws an error.
      // This can happen in private browsing mode or when cookies are disabled.
    }
  })();
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

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function App({ Component, pageProps }: AppPropsWithLayout) {
  // Use the layout defined at the page level, if available.
  const getLayout = Component.getLayout ?? ((page) => page);
  const sparkleContextValue = useMemo(
    () => ({ components: { link: NextLinkWrapper } }),
    []
  );

  return (
    <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
      <PostHogTracker>
        <SparkleContext.Provider value={sparkleContextValue}>
          {getLayout(<Component {...pageProps} />, pageProps)}
        </SparkleContext.Provider>
      </PostHogTracker>
    </FetcherProvider>
  );
}
