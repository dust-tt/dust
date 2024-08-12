import { XMarkIcon } from "@dust-tt/sparkle";
import type { SubscriptionType, WorkspaceType } from "@dust-tt/types";
import { Dialog, Transition } from "@headlessui/react";
import { Bars3Icon } from "@heroicons/react/20/solid";
import React, { Fragment, useContext, useState } from "react";

import type { SidebarNavigation } from "@app/components/navigation/config";
import { DataSourceNavigationTree } from "@app/components/navigation/DataSourceNavigationTree";
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
      <Transition.Root show={sidebarOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50 lg:hidden"
          onClose={setSidebarOpen}
        >
          <Transition.Child
            as={Fragment}
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-900/80" />
          </Transition.Child>

          <div className="fixed inset-0 flex">
            <Transition.Child
              as={Fragment}
              enter="transition ease-in-out duration-300 transform"
              enterFrom="-translate-x-full"
              enterTo="translate-x-0"
              leave="transition ease-in-out duration-300 transform"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <Dialog.Panel className="relative mr-16 flex w-full max-w-xs flex-1">
                <Transition.Child
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
                </Transition.Child>
                <NavigationSidebar
                  subscription={subscription}
                  owner={owner}
                  subNavigation={subNavigation}
                >
                  {navChildren && navChildren}
                </NavigationSidebar>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition.Root>

      {/*Desktop sidebar*/}
      <Transition
        show={isNavigationBarOpen}
        as={Fragment}
        enter="transition-all duration-150 ease-out"
        enterFrom="flex-none lg:w-0 h-full"
        enterTo="flex flex-1 lg:w-80"
        leave="transition-all duration-150 ease-out"
        leaveFrom="flex flex-1 lg:w-80"
        leaveTo="flex-none h-full lg:w-0"
      >
        <div className="hidden flex-1 lg:inset-y-0 lg:z-0 lg:flex lg:w-80 lg:flex-col">
          <NavigationSidebar
            owner={owner}
            subscription={subscription}
            subNavigation={subNavigation}
          >
            <>
              {navChildren && navChildren}

              <DataSourceNavigationTree owner={owner} />
            </>
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
