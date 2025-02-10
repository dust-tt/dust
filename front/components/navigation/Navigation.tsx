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
import type { SubscriptionType, WorkspaceType } from "@dust-tt/types";
import React, { useContext } from "react";

import type { SidebarNavigation } from "@app/components/navigation/config";
import {
  NavigationSidebar,
  ToggleNavigationSidebarButton,
} from "@app/components/navigation/NavigationSidebar";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { classNames } from "@app/lib/utils";

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

  if (hideSidebar) {
    return null;
  }

  return (
    <div className="flex shrink-0 overflow-x-hidden border-r border-border-dark/60 dark:border-border-dark-night/60">
      {/* Mobile sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <div className="fixed left-0 top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 px-4 lg:hidden lg:px-6">
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              icon={MenuIcon}
              onClick={() => setSidebarOpen(true)}
            />
          </SheetTrigger>
        </div>
        <SheetContent side="left" className="flex w-full max-w-xs flex-1 p-0">
          <SheetHeader>
            <SheetTitle className="hidden" />
          </SheetHeader>
          <NavigationSidebar
            subscription={subscription}
            owner={owner}
            subNavigation={subNavigation}
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
        <div className="hidden flex-1 lg:inset-y-0 lg:z-0 lg:flex lg:w-80 lg:flex-col">
          <NavigationSidebar
            owner={owner}
            subscription={subscription}
            subNavigation={subNavigation}
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
