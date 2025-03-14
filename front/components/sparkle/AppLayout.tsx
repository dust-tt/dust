import { cn } from "@dust-tt/sparkle";
import type { SubscriptionType, WorkspaceType } from "@dust-tt/types";
import Head from "next/head";
import type { NextRouter } from "next/router";
import Script from "next/script";
import React, { useEffect, useState } from "react";

import { CONVERSATION_PARENT_SCROLL_DIV_ID } from "@app/components/assistant/conversation/lib";
import type { SidebarNavigation } from "@app/components/navigation/config";
import { Navigation } from "@app/components/navigation/Navigation";
import { QuickStartGuide } from "@app/components/QuickStartGuide";
import { ThemeProvider } from "@app/components/sparkle/ThemeContext";
import { useAppKeyboardShortcuts } from "@app/hooks/useAppKeyboardShortcuts";
import { useUser } from "@app/lib/swr/user";
import { classNames } from "@app/lib/utils";

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
  hasTopPadding,
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
  hasTopPadding?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const { user } = useUser();
  const { isNavigationBarOpen, setIsNavigationBarOpen } =
    useAppKeyboardShortcuts(owner);

  useEffect(() => {
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && user?.sId) {
      // Identify the user with GTM
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        userId: user.sId,
        event: "userIdentified",
      });

      // Identify the user with Common Room
      if (window.signals) {
        window.signals.identify({
          email: user.email,
          name: user.fullName,
        });
      }
    }
  }, [user?.email, user?.fullName, user?.sId]);

  return (
    <ThemeProvider>
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

      <div className="flex h-full flex-row">
        <Navigation
          hideSidebar={hideSidebar}
          isNavigationBarOpen={isNavigationBarOpen}
          setNavigationBarOpen={setIsNavigationBarOpen}
          owner={owner}
          subscription={subscription}
          navChildren={navChildren}
          subNavigation={subNavigation}
        />
        <div
          className={cn(
            "relative h-full w-full flex-1 flex-col overflow-x-hidden overflow-y-hidden",
            "bg-background text-foreground",
            "dark:bg-background-night dark:text-foreground"
          )}
        >
          <main
            id={CONVERSATION_PARENT_SCROLL_DIV_ID.page}
            className={classNames(
              "flex h-full w-full flex-col items-center overflow-y-auto",
              hasTopPadding ?? !titleChildren ? "lg:pt-8" : ""
            )}
          >
            <div
              className={classNames(
                "flex w-full flex-col pl-12 lg:pl-0",
                !hideSidebar
                  ? "border-b border-structure-300/30 bg-white/80 backdrop-blur dark:border-structure-300-night/30 dark:bg-slate-950/80"
                  : "",
                titleChildren ? "" : "lg:hidden"
              )}
            >
              <div className="h-16 grow px-6">
                {loaded && titleChildren && titleChildren}
              </div>
            </div>

            <div className="flex h-full w-full flex-col items-center overflow-y-auto px-4 sm:px-8">
              {isWideMode ? (
                loaded && children
              ) : (
                <div className="flex w-full max-w-4xl grow flex-col">
                  {loaded && children}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
      <QuickStartGuide />
      <Script id="google-tag-manager" strategy="afterInteractive">
        {`
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${process.env.NEXT_PUBLIC_GTM_TRACKING_ID}');
            `}
      </Script>
    </ThemeProvider>
  );
}
