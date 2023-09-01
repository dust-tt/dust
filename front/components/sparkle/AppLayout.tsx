import { Item, Logo, Tab, XMarkIcon } from "@dust-tt/sparkle";
import { Dialog, Menu, Transition } from "@headlessui/react";
import { Bars3Icon } from "@heroicons/react/20/solid";
import Head from "next/head";
import { useRouter } from "next/router";
import Script from "next/script";
import { signOut } from "next-auth/react";
import { Fragment, useState } from "react";

import WorkspacePicker from "@app/components/WorkspacePicker";
import { classNames } from "@app/lib/utils";
import { UserType, WorkspaceType } from "@app/types/user";

import {
  SparkleAppLayoutNavigation,
  topNavigation,
  TopNavigationId,
} from "./navigation";

function NavigationBar({
  user,
  owner,
  topNavigationCurrent,
  subNavigation,
  children,
}: {
  user: UserType | null;
  owner: WorkspaceType;
  topNavigationCurrent: TopNavigationId;
  subNavigation?: SparkleAppLayoutNavigation[] | null;
  children: React.ReactNode;
}) {
  const router = useRouter();

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

                  <Transition
                    as={Fragment}
                    enter="transition ease-out duration-200"
                    enterFrom="transform -translate-y-4 opacity-0 scale-100"
                    enterTo="transform opacity-100 scale-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="transform opacity-100 scale-100"
                    leaveTo="transform opacity-0 scale-95"
                  >
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
                  </Transition>
                </Menu>
              </div>
            )}
          </div>
        </div>

        {user && user.workspaces.length > 1 ? (
          <div className="flex flex-row items-center px-4">
            <div className="text-sm text-slate-500">Workspace:</div>
            <div className="flex-1"></div>
            <div>
              <WorkspacePicker
                user={user}
                workspace={owner}
                readOnly={false}
                onWorkspaceUpdate={(workspace) => {
                  if (workspace.id !== owner.id) {
                    void router.push(`/w/${workspace.sId}/u/chat`);
                  }
                }}
              />
            </div>
          </div>
        ) : null}
        <div>
          <Tab tabs={topNavigation({ owner, current: topNavigationCurrent })} />
        </div>
        {subNavigation && (
          <div>
            {subNavigation.map((nav) => {
              return (
                <div key={nav.label} className="flex grow flex-col">
                  <Item
                    size="md"
                    selected={nav.current}
                    label={nav.label}
                    icon={nav.icon}
                    className="grow px-4"
                    href={nav.href}
                  ></Item>
                  {nav.subMenuLabel && (
                    <div className="grow pb-3 pl-14 pr-4 pt-2 text-sm text-xs uppercase text-slate-400">
                      {nav.subMenuLabel}
                    </div>
                  )}
                  {nav.subMenu && (
                    <div className="mb-2 flex flex-col">
                      {nav.subMenu.map((nav) => {
                        return (
                          <div key={nav.label} className="flex grow">
                            <Item
                              size="sm"
                              selected={nav.current}
                              label={nav.label}
                              icon={nav.icon}
                              className="grow pl-14 pr-4"
                              href={nav.href}
                            ></Item>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div />
      </div>
      <div className="mt-1 flex grow flex-col">{children}</div>
    </div>
  );
}

export default function AppLayout({
  user,
  owner,
  topNavigationCurrent,
  subNavigation,
  gaTrackingId,
  navChildren,
  titleChildren,
  children,
}: {
  user: UserType | null;
  owner: WorkspaceType;
  topNavigationCurrent: TopNavigationId;
  subNavigation?: SparkleAppLayoutNavigation[] | null;
  gaTrackingId: string;
  navChildren?: React.ReactNode;
  titleChildren?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <Head>
        <title>{`Dust - ${owner.name}`}</title>
        <link rel="shortcut icon" href="/static/favicon.png" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
      </Head>

      <div className="light h-full">
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
                    subNavigation={subNavigation}
                    topNavigationCurrent={topNavigationCurrent}
                  >
                    {navChildren && navChildren}
                  </NavigationBar>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </Dialog>
        </Transition.Root>

        {/* Static sidebar for desktop */}
        <div className="hidden lg:fixed lg:inset-y-0 lg:z-0 lg:flex lg:w-80 lg:flex-col">
          <NavigationBar
            user={user}
            owner={owner}
            subNavigation={subNavigation}
            topNavigationCurrent={topNavigationCurrent}
          >
            {navChildren && navChildren}
          </NavigationBar>
        </div>

        <div className="mt-0 h-full flex-1 lg:pl-80">
          {/* Title bar with mobile sidebar opener and possible childrens. */}
          <div className="fixed left-0 top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 px-4 sm:gap-x-6 sm:px-6 lg:px-8">
            <button
              type="button"
              className="-m-2.5 p-2.5 text-gray-700 lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <span className="sr-only">Open sidebar</span>
              <Bars3Icon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div
            className={classNames(
              "fixed left-12 right-0 top-0 z-30 flex h-16 flex-row lg:left-80",
              "border-b border-structure-100 bg-white/30 backdrop-blur-md",
              titleChildren ? "fixed" : "lg:hidden"
            )}
          >
            <div className="grow">
              <div className="mx-auto h-full grow px-6">
                {titleChildren && titleChildren}
              </div>
            </div>
          </div>
          <main
            className={classNames(
              "h-full pt-16",
              titleChildren ? "pt-16" : "lg:pt-8"
            )}
          >
            <div className="mx-auto h-full max-w-4xl px-6">{children}</div>
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
