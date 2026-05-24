import { CommandPalette } from "@app/components/command_palette/CommandPalette";
import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
import { Navigation } from "@app/components/navigation/Navigation";
import { SubscriptionEndBanner } from "@app/components/navigation/TrialBanner";
import { useAppLayout } from "@app/components/sparkle/AppLayoutContext";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import {
  useClosePanel,
  usePanelState,
} from "@app/components/sparkle/PanelContext";
import { useAppKeyboardShortcuts } from "@app/hooks/useAppKeyboardShortcuts";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { isAdmin } from "@app/types/user";
import { cn, XMarkIcon } from "@dust-tt/sparkle";
import React from "react";

interface AppContentLayoutProps {
  children: React.ReactNode;
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

  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    setLoaded(true);
  }, []);

  return (
    <div className="flex h-dvh flex-row">
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
          "relative flex h-full w-full flex-1 flex-col",
          "",
          "bg-app-background text-foreground",
          "dark:bg-background-night dark:text-foreground-night"
        )}
      >
        <div
          className="m-4 rounded-xl overflow-y-scroll"
          style={{
            border: "0.5px solid var(--Border-border, #EEEEEF)",
            background: "var(--Stone-25, #FDFDFC)",
            boxShadow:
              "0 0 0 0.4px rgba(0, 0, 0, 0.02), 0 0 1px 1px rgba(0, 0, 0, 0.02)",
          }}
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
      <SidePanel />
      <CommandPalette owner={owner} user={user} />
    </div>
  );
}

function SidePanel() {
  const state = usePanelState();
  const closePanel = useClosePanel();

  if (!state.isOpen) {
    return null;
  }

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-border">
      <div className="flex items-center justify-end p-2">
        <button onClick={closePanel} className="rounded p-1 hover:bg-muted">
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">{state.renderer()}</div>
    </div>
  );
}
