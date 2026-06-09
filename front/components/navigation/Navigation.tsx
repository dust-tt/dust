import type { SidebarNavigation } from "@app/components/navigation/config";
import {
  NavigationSidebar,
  ToggleNavigationSidebarButton,
} from "@app/components/navigation/NavigationSidebar";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { useUser } from "@app/lib/swr/user";
import { classNames } from "@app/lib/utils";
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
        "text-primary dark:text-primary-night",
        "bg-app-background dark:bg-app-background"
      )}
    >
      {isMobile ? (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <div className="fixed left-0 top-0 z-40 flex h-12 shrink-0 items-center gap-x-4 px-2">
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                icon={Menu01}
                onClick={() => setSidebarOpen(true)}
              />
            </SheetTrigger>
          </div>
          <SheetContent
            side="left"
            className="flex w-full max-w-xs flex-1 bg-app-background dark:bg-app-background-night"
          >
            <SheetHeader
              className="bg-app-background dark:bg-app-background-night p-0"
              hideButton={true}
            >
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
            <div className="flex-1 bg-app-background dark:bg-app-background-night inset-y-0 z-0 flex w-80 flex-col">
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
            // center handle vertically (top at 50% + translate half the handle height)
            className={classNames(
              "fixed z-40 hidden lg:top-1/2 lg:flex lg:-translate-y-1/2",
              isNavigationBarOpen ? "lg:ml-80" : ""
            )}
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
