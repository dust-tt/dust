import type { SubscriptionType, WorkspaceType } from "@dust-tt/types";
import Head from "next/head";
import type { NextRouter } from "next/router";
import { useRouter } from "next/router";
import Script from "next/script";
import React, { useEffect, useState } from "react";

import { CONVERSATION_PARENT_SCROLL_DIV_ID } from "@app/components/assistant/conversation/lib";
import type { SidebarNavigation } from "@app/components/navigation/config";
import { Navigation } from "@app/components/navigation/Navigation";
import { QuickStartGuide } from "@app/components/QuickStartGuide";
import { useAppKeyboardShortcuts } from "@app/hooks/useAppKeyboardShortcuts";
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
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [showQuickGuide, setShowQuickGuide] = useState(false);

  useEffect(() => {
    setShowQuickGuide(router.query.quickGuide === "true");
  }, [router.query]);

  const handleCloseQuickGuide = () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { quickGuide: _, ...restQuery } = router.query;
    void router.push(
      {
        pathname: router.pathname,
        query: restQuery,
      },
      undefined,
      { shallow: true }
    );
  };

  const { isNavigationBarOpen, setIsNavigationBarOpen } =
    useAppKeyboardShortcuts(owner);

  useEffect(() => {
    setLoaded(true);
  }, []);

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
          isNavigationBarOpen={isNavigationBarOpen}
          setNavigationBarOpen={setIsNavigationBarOpen}
          owner={owner}
          subscription={subscription}
          navChildren={navChildren}
          subNavigation={subNavigation}
        />
        <div className="relative h-full w-full flex-1 flex-col overflow-x-hidden overflow-y-hidden">
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
            </div>

            <div className="flex h-[calc(100%-5rem)] w-full flex-col items-center px-4 sm:px-8">
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
      <QuickStartGuide show={showQuickGuide} onClose={handleCloseQuickGuide} />
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
