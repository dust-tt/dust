import { INPUT_BAR_COMPACT_SURFACE_CLASSES } from "@app/components/assistant/conversation/input_bar/inputBarCompactStyles";
import type { SidebarNavigation } from "@app/components/navigation/config";
import {
  NavigationSidebar,
  ToggleNavigationSidebarButton,
} from "@app/components/navigation/NavigationSidebar";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { useUser } from "@app/lib/swr/user";
import type { SubscriptionType } from "@app/types/plan";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  cn,
  Menu01,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import type React from "react";
import { useContext } from "react";

const MOBILE_NAV_MENU_BUTTON_CLASSES = cn(
  INPUT_BAR_COMPACT_SURFACE_CLASSES,
  "transition-none",
  "hover:border-transparent hover:bg-hover hover:backdrop-blur-none",
  "active:border-transparent active:bg-primary-300 active:backdrop-blur-none"
);

interface NavigationProps {
  hideSidebar: boolean;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  navChildren?: React.ReactNode;
  subNavigation?: SidebarNavigation[] | null;
  isNavigationBarOpen: boolean;
  setNavigationBarOpen: (isOpen: boolean) => void;
  isFullScreen: boolean;
  isMobile: boolean;
}

export function Navigation({
  hideSidebar,
  owner,
  subscription,
  navChildren,
  subNavigation,
  isNavigationBarOpen,
  setNavigationBarOpen,
  isFullScreen,
  isMobile,
}: NavigationProps) {
  const { sidebarOpen, setSidebarOpen } = useContext(SidebarContext);

  const { user } = useUser();

  if (hideSidebar) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex shrink-0 overflow-x-hidden",
        "text-primary",
        "bg-app-background"
      )}
    >
      {isMobile ? (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <div className="fixed left-0 top-[var(--banner-height)] z-40 flex shrink-0 items-center px-2 pt-2">
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                icon={Menu01}
                className={MOBILE_NAV_MENU_BUTTON_CLASSES}
                onClick={() => setSidebarOpen(true)}
                aria-label="Open navigation"
              />
            </SheetTrigger>
          </div>
          <SheetContent
            side="left"
            className="flex w-full max-w-xs flex-1 bg-app-background"
          >
            <SheetHeader className="bg-app-background p-0" hideButton={true}>
              <VisuallyHidden>
                <SheetTitle className="hidden" />
              </VisuallyHidden>
            </SheetHeader>
            <NavigationSidebar
              subscription={subscription}
              owner={owner}
              subNavigation={subNavigation}
              user={user}
              isMobile={true}
            >
              {navChildren && navChildren}
            </NavigationSidebar>
          </SheetContent>
        </Sheet>
      ) : (
        <>
          <div
            className={cn(
              "transition-width flex-none overflow-hidden duration-150 ease-out flex flex-col",
              isNavigationBarOpen ? "w-80" : "w-0"
            )}
          >
            <div
              className={cn(
                "flex-1 bg-app-background inset-y-0 z-0 flex w-80 flex-col",
                "transition-opacity duration-150 ease-out motion-reduce:transition-none",
                !isNavigationBarOpen && "opacity-0"
              )}
            >
              <NavigationSidebar
                owner={owner}
                subscription={subscription}
                subNavigation={subNavigation}
                user={user}
              >
                {navChildren && navChildren}
              </NavigationSidebar>
            </div>
          </div>

          <div
            // aligned with the sidebar collapse button (pt-2 + h-8 row)
            className="fixed left-0 top-[var(--banner-height)] z-40 hidden px-0.5 pt-2 lg:flex"
          >
            <ToggleNavigationSidebarButton
              isNavigationBarOpened={isNavigationBarOpen}
              toggleNavigationBarVisibility={(navigationBar) => {
                setNavigationBarOpen(navigationBar);
              }}
              isFullScreen={isFullScreen}
            />
          </div>
        </>
      )}
    </div>
  );
}
