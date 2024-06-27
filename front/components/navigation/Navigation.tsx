import { XMarkIcon } from "@dust-tt/sparkle";
import type { SubscriptionType, WorkspaceType } from "@dust-tt/types";
import {
  Dialog,
  DialogPanel,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { Bars3Icon } from "@heroicons/react/20/solid";
import React, { Fragment, useContext, useState } from "react";

import type { SidebarNavigation } from "@app/components/navigation/config";
import {
  NavigationSidebar,
  ToggleNavigationSidebarButton,
} from "@app/components/navigation/NavigationSidebar";
import { SidebarContext } from "@app/components/sparkle/AppLayout";
import { classNames } from "@app/lib/utils";

interface NavigationProps {
  hideSidebar: boolean;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  navChildren?: React.ReactNode;
  subNavigation?: SidebarNavigation[] | null;
}

export function Navigation({
  hideSidebar,
  owner,
  subscription,
  navChildren,
  subNavigation,
}: NavigationProps) {
  const { sidebarOpen, setSidebarOpen } = useContext(SidebarContext);
  const [isNavigationBarOpen, setNavigationBarOpen] = useState(true);

  if (hideSidebar) {
    return null;
  }

  return (
    <div className="flex shrink-0 overflow-x-hidden">
      {/* Mobile sidebar */}
      <div className="fixed left-0 top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 px-4 lg:hidden lg:px-6">
        <button
          type="button"
          className="-m-2.5 p-2.5 text-gray-700 lg:hidden"
          onClick={() => setSidebarOpen(true)}
        >
          <span className="sr-only">Open sidebar</span>
          <Bars3Icon className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <Transition show={sidebarOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50 lg:hidden"
          onClose={setSidebarOpen}
        >
          <TransitionChild
            as={Fragment}
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-900/80" />
          </TransitionChild>

          <div className="fixed inset-0 flex">
            <TransitionChild
              as={Fragment}
              enter="transition ease-in-out duration-300 transform"
              enterFrom="-translate-x-full"
              enterTo="translate-x-0"
              leave="transition ease-in-out duration-300 transform"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <DialogPanel className="relative mr-16 flex w-full max-w-xs flex-1">
                <TransitionChild
                  as={Fragment}
                  enter="ease-in-out duration-300"
                  enterFrom="opacity-0"
                  enterTo="opacity-100"
                  leave="ease-in-out duration-300"
                  leaveFrom="opacity-100"
                  leaveTo="opacity-0"
                >
                  <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
                    <button
                      type="button"
                      className="-m-2.5 p-2.5"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <span className="sr-only">Close sidebar</span>
                      <XMarkIcon
                        className="h-6 w-6 text-white"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </TransitionChild>
                <NavigationSidebar
                  subscription={subscription}
                  owner={owner}
                  subNavigation={subNavigation}
                >
                  {navChildren && navChildren}
                </NavigationSidebar>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>

      {/*Desktop sidebar*/}
      <Transition show={isNavigationBarOpen}>
        <div
          className={classNames(
            "hidden flex-1 lg:inset-y-0 lg:z-0 lg:flex lg:w-80 lg:flex-col",
            "transition-all ease-out",
            "data-[enter]:duration-150",
            "data-[enter]:data-[closed]:h-full data-[enter]:data-[closed]:flex-none data-[enter]:data-[closed]:lg:w-0",
            "data-[enter]:data-[open]:flex data-[enter]:data-[open]:flex-1 data-[enter]:data-[open]:lg:w-80",
            "data-[leave]:h-full data-[leave]:duration-150",
            "data-[leave]:data-[open]:flex data-[leave]:data-[open]:flex-1 data-[leave]:data-[open]:lg:w-80",
            "data-[leave]:data-[closed]:h-full data-[leave]:data-[closed]:flex-none data-[leave]:data-[closed]:lg:w-0"
          )}
        >
          <NavigationSidebar
            owner={owner}
            subscription={subscription}
            subNavigation={subNavigation}
          >
            {navChildren && navChildren}
          </NavigationSidebar>
        </div>
      </Transition>
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
