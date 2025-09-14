import {
  Button,
  cn,
  MenuIcon,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import React, { useContext } from "react";

import type { SidebarNavigation } from "@app/components/navigation/config";
import {
  NavigationSidebar,
  ToggleNavigationSidebarButton,
} from "@app/components/navigation/NavigationSidebar";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { useUser } from "@app/lib/swr/user";
import { classNames } from "@app/lib/utils";
import type { SubscriptionType, WorkspaceType } from "@app/types";

interface NavigationProps {
  hideSidebar: boolean;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  navChildren?: React.ReactNode;
  subNavigation?: SidebarNavigation[] | null;
  isNavigationBarOpen: boolean;
  setNavigationBarOpen: (isOpen: boolean) => void;
}

export function Navigation({
  hideSidebar,
  owner,
  subscription,
  navChildren,
  subNavigation,
  isNavigationBarOpen,
  setNavigationBarOpen,
}: NavigationProps) {
  const { sidebarOpen, setSidebarOpen } = useContext(SidebarContext);

  const { user } = useUser();

  if (hideSidebar) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex shrink-0 overflow-x-hidden border-r",
        "border-border-dark dark:border-border-dark-night"
      )}
    >
      {/* Mobile sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <div className="fixed left-0 top-0 z-40 flex h-14 shrink-0 items-center gap-x-4 px-2 lg:hidden">
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              icon={MenuIcon}
              onClick={() => setSidebarOpen(true)}
            />
          </SheetTrigger>
        </div>
        <SheetContent
          side="left"
          className="flex w-full max-w-xs flex-1 bg-muted-background dark:bg-muted-background-night"
        >
          <SheetHeader className="bg-muted-background p-0" hideButton={true}>
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

      {/*Desktop sidebar*/}
      <div
        className={cn(
          "transition-width hidden flex-none overflow-hidden duration-150 ease-out lg:flex lg:flex-col",
          isNavigationBarOpen ? "w-80" : "w-0"
        )}
      >
        <div className="hidden flex-1 bg-muted-background dark:bg-muted-background-night lg:inset-y-0 lg:z-0 lg:flex lg:w-80 lg:flex-col">
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
        className={classNames(
          "fixed z-40 hidden lg:top-1/2 lg:flex",
          isNavigationBarOpen ? "lg:ml-80" : ""
        )}
      >
        <ToggleNavigationSidebarButton
          isNavigationBarOpened={isNavigationBarOpen}
          toggleNavigationBarVisibility={(navigationBar) => {
            setNavigationBarOpen(navigationBar);
          }}
        />
      </div>
    </div>
  );
}
