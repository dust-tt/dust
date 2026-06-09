import { CommandPalette } from "@app/components/command_palette/CommandPalette";
import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
import { Navigation } from "@app/components/navigation/Navigation";
import { SubscriptionEndBanner } from "@app/components/navigation/TrialBanner";
import { useAppLayout } from "@app/components/sparkle/AppLayoutContext";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useAppKeyboardShortcuts } from "@app/hooks/useAppKeyboardShortcuts";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import { useHashParam } from "@app/hooks/useHashParams";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { FULL_SCREEN_HASH_PARAM } from "@app/types/conversation_side_panel";
import { isAdmin } from "@app/types/user";
import { cn, ScrollArea } from "@dust-tt/sparkle";
import type React from "react";

interface AppContentLayoutProps {
  children: React.ReactNode;
}

interface AppContentInnerWrapperProps {
  isNavigationBarOpen: boolean;
  isMobile: boolean;
  isFullScreen: boolean;
  children: React.ReactNode;
}

function AppContentInnerWrapper({
  isNavigationBarOpen,
  isMobile,
  isFullScreen,
  children,
}: AppContentInnerWrapperProps) {
  if (isMobile) {
    return (
      <div className="bg-panel-background dark:bg-panel-background-night">
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "my-2 mr-2 rounded-xl flex-1 bg-panel-background dark:bg-panel-background-night border border-border dark:border-border-night overflow-hidden",
        !isNavigationBarOpen && !isFullScreen && "ml-5",
        isFullScreen && "ml-2"
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
  const isMobile = useIsMobile();
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
  const [fullScreenHash] = useHashParam(FULL_SCREEN_HASH_PARAM);

  const isFullScreen = fullScreenHash === "true";

  const hasTitleBar = !!title || hasTitle;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  useDocumentTitle(pageTitle || `Dust - ${owner.name}`);
  useAppKeyboardShortcuts(owner);
  const { isNavigationBarOpen, setIsNavigationBarOpen } =
    useDesktopNavigation();

  return (
    <div className="flex flex-row sm:h-dvh h-full">
      <Navigation
        hideSidebar={hideSidebar}
        isNavigationBarOpen={isNavigationBarOpen}
        setNavigationBarOpen={setIsNavigationBarOpen}
        owner={owner}
        subscription={subscription}
        navChildren={navChildren}
        subNavigation={subNavigation}
        isFullScreen={isFullScreen}
        isMobile={isMobile}
      />

      <div
        className={cn(
          "relative flex h-dvh w-full flex-1 flex-col overflow-hidden",
          "bg-app-background text-foreground",
          "dark:bg-app-background-night dark:text-foreground-night"
        )}
      >
        <AppContentInnerWrapper
          isNavigationBarOpen={isNavigationBarOpen}
          isMobile={isMobile}
          isFullScreen={isFullScreen}
        >
          <SubscriptionEndBanner
            isAdmin={isAdmin(owner)}
            owner={owner}
            subscription={subscription}
          />
          {/* Temporary measure to preserve title existence on smaller screens.
           * Page has no title, prepend empty AppLayoutTitle. */}
          {!hasTitleBar && (
            <div className="flex min-h-0 flex-1 flex-col h-container">
              <ScrollArea>
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
              </ScrollArea>
            </div>
          )}
          {hasTitleBar && (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
