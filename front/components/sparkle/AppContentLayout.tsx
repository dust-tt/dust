import { cn } from "@dust-tt/sparkle";
import Head from "next/head";
import type { NextRouter } from "next/router";
import React, { useEffect, useState } from "react";

import { CONVERSATION_PARENT_SCROLL_DIV_ID } from "@app/components/assistant/conversation/lib";
import type { SidebarNavigation } from "@app/components/navigation/config";
import { Navigation } from "@app/components/navigation/Navigation";
import { useAppKeyboardShortcuts } from "@app/hooks/useAppKeyboardShortcuts";
import { classNames } from "@app/lib/utils";
import type { SubscriptionType, WorkspaceType } from "@app/types";

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

interface AppContentLayoutProps {
  children: React.ReactNode;
  hasTopPadding?: boolean;
  hideSidebar?: boolean;
  isConversationView?: boolean;
  isWideMode?: boolean;
  navChildren?: React.ReactNode;
  owner: WorkspaceType;
  pageTitle?: string;
  subNavigation?: SidebarNavigation[] | null;
  subscription: SubscriptionType;
  titleChildren?: React.ReactNode;
}

// TODO(2025-04-11 yuka) We need to refactor AppLayout to avoid re-mounting on every page navigation.
// Until then, AppLayout has been split into AppRootLayout and AppContentLayout.
// When you need to use AppContentLayout, add `getLayout` function to your page and wrap the page with AppRootLayout.
export default function AppContentLayout({
  children,
  hasTopPadding,
  hideSidebar = false,
  isConversationView,
  isWideMode = false,
  navChildren,
  owner,
  pageTitle,
  subNavigation,
  subscription,
  titleChildren,
}: AppContentLayoutProps) {
  const [loaded, setLoaded] = useState(false);
  const { isNavigationBarOpen, setIsNavigationBarOpen } =
    useAppKeyboardShortcuts(owner);

  useEffect(() => {
    setLoaded(true);
  }, []);

  return (
    <div className="flex h-full flex-row">
      <Head>
        <title>{pageTitle || `Dust - ${owner.name}`}</title>
      </Head>
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
          "dark:bg-background-night dark:text-foreground-night"
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
            className={cn(
              "flex h-14 w-full shrink-0 flex-col px-4 pl-14 lg:pl-4",
              !hideSidebar &&
                "border-b border-border bg-background dark:border-border-night dark:bg-background-night",
              titleChildren ? "" : "lg:hidden"
            )}
          >
            {loaded && titleChildren && titleChildren}
          </div>

          <div
            className={cn(
              "flex h-full w-full flex-col items-center overflow-y-auto",
              !isConversationView && "px-4 sm:px-8"
            )}
          >
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
  );
}
