import { cn } from "@dust-tt/sparkle";
import Head from "next/head";
import type { NextRouter } from "next/router";
import React from "react";

import type { SidebarNavigation } from "@app/components/navigation/config";
import { Navigation } from "@app/components/navigation/Navigation";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useAppKeyboardShortcuts } from "@app/hooks/useAppKeyboardShortcuts";
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
    // Set up beforePopState to intercept the back navigation and clean query params.
    router.beforePopState(({ as }) => {
      // Parse the destination URL that router.back() would navigate to.
      const urlObj = new URL(as, window.location.origin);
      // Remove assistantDetails query parameter from the destination URL.
      urlObj.searchParams.delete("assistantDetails");

      // Reconstruct the cleaned URL.
      const cleanedUrl = urlObj.pathname + urlObj.search;

      // Navigate to the cleaned URL instead of the original back destination.
      void router.push(cleanedUrl);
      return false; // Prevent the default back navigation to allow our custom navigation.
    });

    // Trigger the back navigation, which will be intercepted by beforePopState.
    router.back();
  }
};

export interface AppContentLayoutProps {
  children: React.ReactNode;
  hasTitle?: boolean;
  hideSidebar?: boolean;
  navChildren?: React.ReactNode;
  owner: WorkspaceType;
  pageTitle?: string;
  subNavigation?: SidebarNavigation[] | null;
  subscription: SubscriptionType;
}

// TODO(2025-04-11 yuka) We need to refactor AppLayout to avoid re-mounting on every page navigation.
// Until then, AppLayout has been split into AppRootLayout and AppContentLayout.
// When you need to use AppContentLayout, add `getLayout` function to your page and wrap the page with AppRootLayout.
export default function AppContentLayout({
  children,
  hasTitle = false,
  hideSidebar = false,
  navChildren,
  owner,
  pageTitle,
  subNavigation,
  subscription,
}: AppContentLayoutProps) {
  const { isNavigationBarOpen, setIsNavigationBarOpen } =
    useAppKeyboardShortcuts(owner);

  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
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
          "relative h-full w-full flex-1 overflow-hidden",
          "bg-background text-foreground",
          "dark:bg-background-night dark:text-foreground-night"
        )}
      >
        {/* Temporary measure to preserve title existence on smaller screens.
         * Page has no title, prepend empty AppLayoutTitle. */}
        {loaded && !hasTitle ? (
          <>
            <AppLayoutTitle />
            {children}
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
