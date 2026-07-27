import { CommandPalette } from "@app/components/command_palette/CommandPalette";
import { DEV_MODE_ACTIVE } from "@app/components/dev/devModeConstants";
import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
import { Navigation } from "@app/components/navigation/Navigation";
import { SubscriptionEndBanner } from "@app/components/navigation/TrialBanner";
import { useAppLayout } from "@app/components/sparkle/AppLayoutContext";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useAppKeyboardShortcuts } from "@app/hooks/useAppKeyboardShortcuts";
import { useDocumentScrollMode } from "@app/hooks/useDocumentScrollMode";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import { useHashParam } from "@app/hooks/useHashParams";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { MOBILE_DOCUMENT_SCROLL_CLASSES } from "@app/lib/documentScrollLayoutClasses";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { FULL_SCREEN_HASH_PARAM } from "@app/types/conversation_side_panel";
import { isDevelopment } from "@app/types/shared/env";
import { isAdmin } from "@app/types/user";
import { cn } from "@dust-tt/sparkle";
import type React from "react";
import { lazy, Suspense, useEffect } from "react";

// Lazy-load the dev panel only when dev mode is active.
// The module is never fetched/parsed/executed when dev mode is off.
const DevFeatureFlagPanel = DEV_MODE_ACTIVE
  ? lazy(() =>
      // Dynamic import is necessary here: the dev panel must not be bundled
      // in the main chunk — it should only load when dev mode is active.
      import("@app/components/dev/DevFeatureFlagPanel").then((m) => ({
        default: m.DevFeatureFlagPanel,
      }))
    )
  : null;

interface AppContentLayoutProps {
  children: React.ReactNode;
}

// The horizontal page gutter — the only place pages get horizontal padding
// from. Pages never set their own top-level px-* (design_docs/LAYOUT_SYSTEM.md
// §3.3 R1). md: is the single layout breakpoint (R3).
export const PAGE_GUTTER_CLASSES = "px-4 md:px-8";

// Warn (dev only) when a page stays undeclared. Lazy chunk loads and redirect
// elements legitimately leave contentWidth undefined for a moment — the delay
// keeps those quiet; anything undeclared past it is a real missing archetype.
const UNDECLARED_WARN_DELAY_MS = 1500;

function useWarnOnUndeclaredContentWidth(
  contentWidth: string | undefined
): void {
  useEffect(() => {
    if (!isDevelopment() || contentWidth !== undefined) {
      return;
    }
    const timer = setTimeout(() => {
      console.warn(
        `[layout] No contentWidth declared for ${window.location.pathname} — ` +
          `rendering as "full". Declare useSetContentWidth("centered" | "wide" | "full") ` +
          `(see design_docs/LAYOUT_SYSTEM.md §3.4).`
      );
    }, UNDECLARED_WARN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [contentWidth]);
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
    return children;
  }

  return (
    <div
      className={cn(
        "my-2 mr-2 rounded-xl flex-1 bg-panel-background border border-border overflow-hidden h-panel",
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
  const { featureFlags, subscription, user } = useAuth();
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
  // "centered" and "wide" get the shell-managed width wrapper; "full" (and
  // transient undefined) renders children bare — the page owns everything.
  const isManagedWidth = contentWidth === "centered" || contentWidth === "wide";
  useWarnOnUndeclaredContentWidth(contentWidth);
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  useDocumentTitle(pageTitle || `Dust - ${owner.name}`);
  useAppKeyboardShortcuts(owner);
  const { isNavigationBarOpen, setIsNavigationBarOpen } =
    useDesktopNavigation();

  useDocumentScrollMode(isMobile);

  return (
    <div
      className={cn(
        "flex flex-col",
        isMobile ? MOBILE_DOCUMENT_SCROLL_CLASSES.contentRoot : "h-dvh"
      )}
    >
      <SubscriptionEndBanner
        isAdmin={isAdmin(owner)}
        owner={owner}
        subscription={subscription}
      />
      <div
        className={cn(
          "flex flex-row",
          isMobile
            ? MOBILE_DOCUMENT_SCROLL_CLASSES.contentRow
            : "min-h-0 flex-1"
        )}
      >
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
            "relative flex w-full flex-1 flex-col text-foreground",
            isMobile
              ? MOBILE_DOCUMENT_SCROLL_CLASSES.contentMain
              : "h-full overflow-x-hidden bg-app-background"
          )}
        >
          <AppContentInnerWrapper
            isNavigationBarOpen={isNavigationBarOpen}
            isMobile={isMobile}
            isFullScreen={isFullScreen}
          >
            {/* Temporary measure to preserve title existence on smaller screens.
             * Page has no title, prepend empty AppLayoutTitle. */}
            {!hasTitleBar && (
              <div
                className={cn(
                  "flex flex-1 flex-col",
                  isMobile
                    ? MOBILE_DOCUMENT_SCROLL_CLASSES.contentArea
                    : "min-h-0 h-panel overflow-y-auto [scrollbar-gutter:stable]"
                )}
              >
                <AppLayoutTitle />
                {isManagedWidth ? (
                  <div
                    className={cn(
                      "flex w-full flex-col items-center",
                      isMobile
                        ? MOBILE_DOCUMENT_SCROLL_CLASSES.contentArea
                        : "h-full overflow-y-auto [scrollbar-gutter:stable]",
                      contentWidth === "centered" ? "pt-4" : "pt-8",
                      contentClassName
                    )}
                  >
                    <div
                      className={cn(
                        "flex w-full grow flex-col",
                        PAGE_GUTTER_CLASSES,
                        contentWidth === "centered" && "max-w-content"
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
              <div
                className={cn(
                  "flex flex-1 flex-col",
                  isMobile
                    ? MOBILE_DOCUMENT_SCROLL_CLASSES.contentArea
                    : "min-h-0 overflow-y-auto [scrollbar-gutter:stable]"
                )}
              >
                {isManagedWidth ? (
                  <>
                    {title}
                    <div
                      className={cn(
                        "flex w-full flex-col items-center",
                        isMobile
                          ? MOBILE_DOCUMENT_SCROLL_CLASSES.contentArea
                          : "overflow-y-auto [scrollbar-gutter:stable]",
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
                          "flex w-full grow flex-col",
                          PAGE_GUTTER_CLASSES,
                          contentWidth === "centered" && "max-w-content"
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
      {DevFeatureFlagPanel && (
        <Suspense fallback={null}>
          <DevFeatureFlagPanel serverFlags={featureFlags} />
        </Suspense>
      )}
    </div>
  );
}
