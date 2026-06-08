import { CommandPalette } from "@app/components/command_palette/CommandPalette";
import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
import { Navigation } from "@app/components/navigation/Navigation";
import { SubscriptionEndBanner } from "@app/components/navigation/TrialBanner";
import { useAppLayout } from "@app/components/sparkle/AppLayoutContext";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useAppKeyboardShortcuts } from "@app/hooks/useAppKeyboardShortcuts";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { isAdmin } from "@app/types/user";
import { cn } from "@dust-tt/sparkle";
import type React from "react";

interface AppContentLayoutProps {
  children: React.ReactNode;
}

interface AppContentInnerWrapperProps {
  isNavigationBarOpen: boolean;
  children: React.ReactNode;
}

function AppContentInnerWrapper({
  isNavigationBarOpen,
  children,
}: AppContentInnerWrapperProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="bg-content-background dark:bg-content-background-night">
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "m-2 rounded-xl flex-1 overflow-y-scroll bg-content-background dark:bg-content-background-night border border-border dark:border-border-night",
        !isNavigationBarOpen && "ml-5"
      )}
      style={{
        boxShadow:
          "0 0 0 0.4px rgba(0, 0, 0, 0.02), 0 0 1px 1px rgba(0, 0, 0, 0.02)",
      }}
    >
      {children}
    </div>
  );
}

export function AppContentLayout({ children }: AppContentLayoutProps) {
  const owner = useWorkspace();
  const { subscription, user } = useAuth();
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
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  useDocumentTitle(pageTitle || `Dust - ${owner.name}`);
  useAppKeyboardShortcuts(owner);
  const { isNavigationBarOpen, setIsNavigationBarOpen } =
    useDesktopNavigation();

  return (
    <div className="flex h-dvh flex-row">
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
          "relative flex h-dvh w-full flex-1 flex-col overflow-hidden",
          "bg-app-background text-foreground",
          "dark:bg-app-background-night dark:text-foreground-night"
        )}
      >
        <AppContentInnerWrapper isNavigationBarOpen={isNavigationBarOpen}>
          <SubscriptionEndBanner
            isAdmin={isAdmin(owner)}
            owner={owner}
            subscription={subscription}
          />
          {/* Temporary measure to preserve title existence on smaller screens.
           * Page has no title, prepend empty AppLayoutTitle. */}
          {!hasTitleBar && (
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
          {hasTitleBar && (
            <div className="flex min-h-0 flex-1 flex-col">
              {contentWidth ? (
                <>
                  {title}
                  <div
                    className={cn(
                      "flex w-full flex-col items-center overflow-y-auto",
                      contentWidth === "centered"
                        ? cn(
                            title ? "h-[calc(100vh-3.5rem)]" : "h-full",
                            "pt-4"
                          )
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
        </AppContentInnerWrapper>
      </div>
      <CommandPalette owner={owner} user={user} />
    </div>
  );
}
