// Tailwind base globals
import "@app/styles/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local tailwind components override sparkle styles
import "@app/styles/components.css";

import { useUser } from "@app/lib/swr/user";
import { datadogLogs } from "@datadog/browser-logs";
import type { NextPage } from "next";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { useEffect } from "react";

import RootLayout from "@app/components/app/RootLayout";

if (process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN) {
  datadogLogs.init({
    clientToken: process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN,
    env: process.env.NODE_ENV === "production" ? "prod" : "dev",
    service: process.env.NEXT_PUBLIC_DATADOG_SERVICE,
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
  // Use the layout defined at the page level, if available.
  const getLayout = Component.getLayout ?? ((page) => page);

  const router = useRouter();
  const { wId } = router.query;
  useEffect(() => {
    const updateLoggerContext = () => {
      if (wId) {
        datadogLogs.setGlobalContext({
          workspaceId: wId,
        });
      } else {
        datadogLogs.setGlobalContext({});
      }
    };

    updateLoggerContext();
    router.events.on("routeChangeComplete", updateLoggerContext);
    return () => {
      router.events.off("routeChangeComplete", updateLoggerContext);
    };
  }, [wId, router.events]);

  const { user } = useUser();
  const userId = user?.sId;
  useEffect(() => {
    if (userId) {
      datadogLogs.setUser({
        id: userId,
      });
    } else {
      datadogLogs.clearUser();
    }
  }, [userId]);

  return (
    <RootLayout>
      {getLayout(<Component {...pageProps} />, pageProps)}
    </RootLayout>
  );
}
