import { Banner } from "@dust-tt/sparkle";
import type { SubscriptionType, WorkspaceType } from "@dust-tt/types";
import Head from "next/head";
import type { NextRouter } from "next/router";
import { useRouter } from "next/router";
import Script from "next/script";
import React, { useEffect, useState } from "react";

import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { HelpAndQuickGuideWrapper } from "@app/components/assistant/conversation/HelpAndQuickGuideWrapper";
import { CONVERSATION_PARENT_SCROLL_DIV_ID } from "@app/components/assistant/conversation/lib";
import type { SidebarNavigation } from "@app/components/navigation/config";
import { Navigation } from "@app/components/navigation/Navigation";
import { useUser } from "@app/lib/swr/user";
import { ClientSideTracking } from "@app/lib/tracking/client";
import { classNames } from "@app/lib/utils";

/* Set to true when there is an incident, to show the banner (customize
 * IncidentBanner component at bottom of the page)
 */
const SHOW_INCIDENT_BANNER = false;

// This function is used to navigate back to the previous page (eg modal like page close) and
// fallback to the landing if we linked directly to that modal.
export const appLayoutBack = async (
  owner: WorkspaceType,
  router: NextRouter
) => {
  // TODO(2024-02-08 flav) Remove once internal router is in better shape. Opening a new tab/window
  // counts the default page as an entry in the history stack, leading to a history length of 2.
  // Directly opening a link without the "new tab" page results in a history length of 1.
  if (window.history.length < 3) {
    await router.push(`/w/${owner.sId}/assistant/new`);
  } else {
    router.back();
  }
};

export default function AppLayout({
  owner,
  subscription,
  isWideMode = false,
  hideSidebar = false,
  subNavigation,
  pageTitle,
  navChildren,
  titleChildren,
  children,
}: {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  isWideMode?: boolean;
  hideSidebar?: boolean;
  subNavigation?: SidebarNavigation[] | null;
  pageTitle?: string;
  navChildren?: React.ReactNode;
  titleChildren?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();
  const user = useUser();

  useEffect(() => {
    setLoaded(true);
  }, []);

  useEffect(() => {
    ClientSideTracking.trackPageView({
      user: user?.user ?? undefined,
      workspaceId: owner.sId,
      pathname: router.pathname,
    });
  }, [owner.sId, router.pathname, user?.user]);

  return (
    <>
      <Head>
        <title>{pageTitle ? pageTitle : `Dust - ${owner.name}`}</title>
        <link rel="shortcut icon" href="/static/favicon.png" />

        <meta name="apple-mobile-web-app-title" content="Dust" />
        <link rel="apple-touch-icon" href="/static/AppIcon.png" />
        <link
          rel="apple-touch-icon"
          sizes="60x60"
          href="/static/AppIcon_60.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="76x76"
          href="/static/AppIcon_76.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="120x120"
          href="/static/AppIcon_120.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="152x152"
          href="/static/AppIcon_152.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="167x167"
          href="/static/AppIcon_167.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/static/AppIcon_180.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="192x192"
          href="/static/AppIcon_192.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="228x228"
          href="/static/AppIcon_228.png"
        />

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
      </Head>
      <div className="light flex h-full flex-row">
        <Navigation
          hideSidebar={hideSidebar}
          owner={owner}
          subscription={subscription}
          navChildren={navChildren}
          subNavigation={subNavigation}
        />
        <div className="relative h-full w-full flex-1 flex-col overflow-x-hidden overflow-y-hidden">
          {!titleChildren && SHOW_INCIDENT_BANNER && (
            <IncidentBanner className="relative" />
          )}
          <main
            id={CONVERSATION_PARENT_SCROLL_DIV_ID.page}
            className={classNames(
              "flex h-full w-full flex-col items-center overflow-y-auto",
              titleChildren ? "" : "lg:pt-8"
            )}
          >
            {/* TODO: This should be moved to a TopBar component. */}
            <div
              className={classNames(
                "sticky left-0 top-0 z-30 mb-4 flex w-full flex-col pl-12 lg:pl-0",
                !hideSidebar
                  ? "border-b border-structure-300/30 bg-white/80 backdrop-blur"
                  : "",
                titleChildren ? "" : "lg:hidden"
              )}
            >
              <div className="h-16 grow px-6">
                {loaded && titleChildren && titleChildren}
              </div>
              {titleChildren && SHOW_INCIDENT_BANNER && <IncidentBanner />}
            </div>

            <div
              className={classNames(
                "flex h-[calc(100%-5rem)] w-full flex-col",
                isWideMode ? "items-center" : "max-w-4xl"
              )}
            >
              {loaded && children}
            </div>
          </main>
        </div>
      </div>
      {user.user && (
        <GenerationContextProvider>
          <HelpAndQuickGuideWrapper owner={owner} user={user.user} />
        </GenerationContextProvider>
      )}
      <>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_TRACKING_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', '${process.env.NEXT_PUBLIC_GA_TRACKING_ID}');
          `}
        </Script>
      </>
    </>
  );
}

function IncidentBanner({ className = "" }: { className?: string }) {
  return (
    <Banner className={className} variant="incident">
      <div>
        <span className="font-bold">
          OpenAI APIs are encountering a{" "}
          <a
            href="https://status.openai.com/"
            target="_blank"
            className="underline"
          >
            partial outage.
          </a>
        </span>
        <span>
          It may cause slowness and errors from assistants using GPT or data
          retrieval. We are monitoring the situation{" "}
          <a
            href="http://status.dust.tt/"
            target="_blank"
            className="underline"
          >
            here
          </a>
          .
        </span>
      </div>
    </Banner>
  );
}
