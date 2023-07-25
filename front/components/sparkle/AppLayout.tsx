import {
  BeakerIcon,
  ChatBubbleBottomCenterTextIcon,
  Cog6ToothIcon,
  Item,
  Logo,
  SparkleContext,
  Tab,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { Dialog, Menu, Transition } from "@headlessui/react";
import { Bars3Icon } from "@heroicons/react/20/solid";
import Link from "next/link";
import Script from "next/script";
import { signOut } from "next-auth/react";
import { Fragment, MouseEvent, ReactNode, useState } from "react";

import { GoogleSignInButton } from "@app/components/Button";
import WorkspacePicker from "@app/components/WorkspacePicker";
import { classNames } from "@app/lib/utils";
import { UserType, WorkspaceType } from "@app/types/user";

export type SparkleAppLayoutNavigation = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  workspaceRelativePath: string;
  hideLabel?: boolean;
  sizing?: "hug" | "expand";
  current?: boolean;
};

export type TopNavigationLabel = "Assistant" | "Lab" | "Settings";

const topNavigation: SparkleAppLayoutNavigation[] = [
  {
    label: "Assistant",
    icon: ChatBubbleBottomCenterTextIcon,
    workspaceRelativePath: "/u/chat",
    sizing: "expand",
  },
  {
    label: "Lab",
    icon: BeakerIcon,
    workspaceRelativePath: "/u/gens",
    sizing: "expand",
  },
  {
    label: "Settings",
    hideLabel: true,
    icon: Cog6ToothIcon,
    workspaceRelativePath: "/ds",
  },
];

function NavigationBar({
  user,
  owner,
  navigation,
  topNavigationLabel,
  children,
}: {
  user: UserType | null;
  owner: WorkspaceType;
  navigation?: SparkleAppLayoutNavigation[] | null;
  topNavigationLabel: TopNavigationLabel;
  children: React.ReactNode;
}) {
  const computedTopNavigation = topNavigation.map((nav) => {
    const current = nav.label === topNavigationLabel;
    return {
      ...nav,
      href: `/w/${owner.sId}${nav.workspaceRelativePath}`,
      workspaceRelativePath: undefined,
      current,
    };
  });

  const computedNavigation =
    navigation?.map((nav) => {
      return {
        ...nav,
        href: `/w/${owner.sId}${nav.workspaceRelativePath}`,
        workspaceRelativePath: undefined,
        current: nav.current,
      };
    }) || null;

  return (
    <div className="flex grow flex-col border-r border-structure-200 bg-structure-50">
      <div className="mt-4 flex flex-col space-y-4">
        <div className="flex flex-row">
          <div className="flex flex-initial items-center">
            <Logo className="-ml-4 h-4 w-32" />
          </div>
          <div className="flex flex-1"></div>
          <div className="flex flex-initial">
            {user && (
              <div className="static inset-auto right-0 flex flex-initial items-center pr-4">
                <Menu as="div" className="relative">
                  <div>
                    <Menu.Button className="focus:outline-nonek flex rounded-full bg-gray-800 text-sm">
                      <span className="sr-only">Open user menu</span>
                      <img
                        className="h-10 w-10 rounded-xl"
                        src={
                          user.image
                            ? user.image
                            : "https://gravatar.com/avatar/anonymous?d=mp"
                        }
                        alt=""
                      />
                    </Menu.Button>
                  </div>
                  <Menu.Items className="absolute right-0 z-10 mt-2 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <Menu.Item>
                      {({ active }) => (
                        <a
                          href="#"
                          onClick={() =>
                            signOut({
                              callbackUrl: "/",
                              redirect: true,
                            })
                          }
                          className={classNames(
                            active ? "bg-gray-50" : "",
                            "block px-4 py-2 text-sm text-gray-700"
                          )}
                        >
                          Sign&nbsp;out
                        </a>
                      )}
                    </Menu.Item>
                  </Menu.Items>
                </Menu>
              </div>
            )}
          </div>
        </div>
        <div>
          <Tab tabs={computedTopNavigation} />
        </div>
        {computedNavigation && (
          <div>
            {computedNavigation.map((nav) => {
              return (
                <div key={nav.label} className="flex grow">
                  <Item
                    size="md"
                    selected={nav.current}
                    label={nav.label}
                    icon={nav.icon}
                    className="grow px-4"
                    href={nav.href}
                  ></Item>
                </div>
              );
            })}
          </div>
        )}
        <div>
          <a href=""></a>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function AppLayout({
  user,
  owner,
  topNavigationLabel,
  navigation,
  gaTrackingId,
  children,
}: {
  user: UserType | null;
  owner: WorkspaceType;
  topNavigationLabel: TopNavigationLabel;
  navigation?: SparkleAppLayoutNavigation[] | null;
  gaTrackingId: string;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <div className="light">
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
                  <NavigationBar
                    user={user}
                    owner={owner}
                    navigation={navigation}
                    topNavigationLabel={topNavigationLabel}
                  >
                    <></>
                  </NavigationBar>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </Dialog>
        </Transition.Root>

        {/* Static sidebar for desktop */}
        <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-80 lg:flex-col">
          <NavigationBar
            user={user}
            owner={owner}
            navigation={navigation}
            topNavigationLabel={topNavigationLabel}
          >
            <></>
          </NavigationBar>
        </div>

        <div className="mt-0 flex-1 lg:pl-80">
          <div className="absolute left-0 top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 px-4 sm:gap-x-6 sm:px-6 lg:px-8">
            <button
              type="button"
              className="-m-2.5 p-2.5 text-gray-700 lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <span className="sr-only">Open sidebar</span>
              <Bars3Icon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <main className="pb-10 pt-4">
            <div className="mx-auto max-w-4xl px-6">{children}</div>
          </main>
        </div>
      </div>
      <>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${gaTrackingId}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', '${gaTrackingId}');
          `}
        </Script>
      </>
    </>
  );
}
