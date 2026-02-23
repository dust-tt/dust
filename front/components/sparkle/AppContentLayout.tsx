import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
import { Navigation } from "@app/components/navigation/Navigation";
import { SubscriptionEndBanner } from "@app/components/navigation/TrialBanner";
import { useAppLayout } from "@app/components/sparkle/AppLayoutContext";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useAppKeyboardShortcuts } from "@app/hooks/useAppKeyboardShortcuts";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { Head } from "@app/lib/platform";
import { isAdmin } from "@app/types/user";
import { cn } from "@dust-tt/sparkle";
import React from "react";

interface AppContentLayoutProps {
  children: React.ReactNode;
}

export function AppContentLayout({ children }: AppContentLayoutProps) {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const {
    contentClassName,
    contentWidth,
    hasTitle = false,
    hideSidebar = false,
    navChildren,
    pageTitle,
    subNavigation,
    title,
  } = useAppLayout();

  const hasTitleBar = !!title || hasTitle;
  useAppKeyboardShortcuts(owner);
  const { isNavigationBarOpen, setIsNavigationBarOpen } =
    useDesktopNavigation();

  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    setLoaded(true);
  }, []);

  return (
    <div className="flex h-full flex-row">
      <Head>
        {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
        <title>{pageTitle || `Dust - ${owner.name}`}</title>
      </Head>
      {loaded && (
        <Navigation
          hideSidebar={hideSidebar}
          isNavigationBarOpen={isNavigationBarOpen}
          setNavigationBarOpen={setIsNavigationBarOpen}
          owner={owner}
          subscription={subscription}
          navChildren={navChildren}
          subNavigation={subNavigation}
        />
      )}

      <div
        className={cn(
          "relative flex h-full w-full flex-1 flex-col overflow-hidden",
          "bg-background text-foreground",
          "dark:bg-background-night dark:text-foreground-night"
        )}
      >
        <SubscriptionEndBanner
          isAdmin={isAdmin(owner)}
          owner={owner}
          subscription={subscription}
        />
        {/* Temporary measure to preserve title existence on smaller screens.
         * Page has no title, prepend empty AppLayoutTitle. */}
        {loaded && !hasTitleBar && (
          <div className="flex min-h-0 flex-1 flex-col">
            <AppLayoutTitle />
            {contentWidth ? (
              <div
                className={cn(
                  "flex h-full w-full flex-col items-center overflow-y-auto",
                  contentWidth === "centered" ? "pt-4" : "pt-8",
                  contentClassName
                )}
              >
                <div
                  className={cn(
                    "flex w-full grow flex-col px-4 sm:px-8",
                    contentWidth === "centered" && "max-w-4xl"
                  )}
                >
                  {children}
                </div>
              </div>
            ) : (
              children
            )}
          </div>
        )}
        {loaded && hasTitleBar && (
          <div className="flex min-h-0 flex-1 flex-col">
            {contentWidth ? (
              <>
                {title}
                <div
                  className={cn(
                    "flex w-full flex-col items-center overflow-y-auto",
                    contentWidth === "centered"
                      ? cn(title ? "h-[calc(100vh-3.5rem)]" : "h-full", "pt-4")
                      : "h-full pt-8",
                    contentClassName
                  )}
                >
                  <div
                    className={cn(
                      "flex w-full grow flex-col px-4 sm:px-8",
                      contentWidth === "centered" && "max-w-4xl"
                    )}
                  >
                    {children}
                  </div>
                </div>
              </>
            ) : (
              children
            )}
          </div>
        )}
      </div>
    </div>
  );
}
