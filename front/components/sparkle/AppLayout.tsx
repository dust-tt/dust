import {
  Avatar,
  DropdownMenu,
  Item,
  Logo,
  Tab,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { Dialog, Transition } from "@headlessui/react";
import { Bars3Icon } from "@heroicons/react/20/solid";
import Head from "next/head";
import { useRouter } from "next/router";
import Script from "next/script";
import { signOut } from "next-auth/react";
import { Fragment, useState } from "react";

import WorkspacePicker from "@app/components/WorkspacePicker";
import { isOnAssistantV2 } from "@app/lib/assistant";
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
    <div className="flex min-w-0 grow flex-col border-r border-structure-200 bg-structure-50">
      <div className="flex flex-col gap-2">
        <div className="flex flex-row p-3">
          <div className="flex flex-col gap-2">
            <div className="pt-3">
              <Logo className="h-4 w-16" />
            </div>
            {user && user.workspaces.length > 1 ? (
              <div className="flex flex-row gap-2">
                <div className="text-sm text-slate-500">Workspace:</div>
                <WorkspacePicker
                  user={user}
                  workspace={owner}
                  readOnly={false}
                  onWorkspaceUpdate={(workspace) => {
                    const assistantRoute = isOnAssistantV2(owner)
                      ? `/w/${workspace.sId}/assistant/new`
                      : `/w/${workspace.sId}/u/chat`;
                    if (workspace.id !== owner.id) {
                      void router
                        .push(assistantRoute)
                        .then(() => router.reload());
                    }
                  }}
                />
              </div>
            ) : null}
          </div>
          <div className="flex flex-1"></div>
          {user && (
            <DropdownMenu>
              <DropdownMenu.Button className="focus:outline-nonek flex rounded-full bg-gray-800 text-sm">
                <span className="sr-only">Open user menu</span>
                <Avatar
                  size="md"
                  visual={
                    user.image
                      ? user.image
                      : "https://gravatar.com/avatar/anonymous?d=mp"
                  }
                  onClick={() => {
                    "clickable";
                  }}
                />
              </DropdownMenu.Button>
              <DropdownMenu.Items origin="topRight">
                <DropdownMenu.Item
                  label="Sign&nbsp;out"
                  onClick={() => {
                    void signOut({
                      callbackUrl: "/",
                      redirect: true,
                    });
                  }}
                />
              </DropdownMenu.Items>
            </DropdownMenu>
          )}
        </div>
        <div>
          <Tab tabs={topNavigation({ owner, current: topNavigationCurrent })} />
        </div>
        {subNavigation && (
          <div>
            {subNavigation.map((nav) => {
              return (
                <div key={nav.id} className="flex grow flex-col">
                  <Item
                    size="md"
                    selected={nav.current}
                    label={nav.label}
                    icon={nav.icon}
                    className="grow px-4"
                    href={nav.href}
                  />
                  {nav.subMenuLabel && (
                    <div className="grow pb-3 pl-14 pr-4 pt-2 text-sm text-xs uppercase text-slate-400">
                      {nav.subMenuLabel}
                    </div>
                  )}
                  {nav.subMenu && (
                    <div className="mb-2 flex flex-col">
                      {nav.subMenu.map((nav) => {
                        return (
                          <div key={nav.id} className="flex grow">
                            <Item
                              size="sm"
                              selected={nav.current}
                              label={nav.label}
                              icon={nav.icon}
                              className="grow pl-14 pr-4"
                              href={nav.href}
                            />
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
      </div>
      <div className="flex grow flex-col">{children}</div>
    </div>
  );
}

export default function AppLayout({
  user,
  owner,
  isWideMode = false,
  hideSidebar = false,
  topNavigationCurrent,
  subNavigation,
  gaTrackingId,
  navChildren,
  titleChildren,
  children,
}: {
  user: UserType | null;
  owner: WorkspaceType;
  isWideMode?: boolean;
  hideSidebar?: boolean;
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
        {!hideSidebar && (
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
        )}

        {!hideSidebar && (
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
        )}

        <div
          className={classNames(
            "mt-0 h-full flex-1",
            !hideSidebar ? "lg:pl-80" : ""
          )}
        >
          <div
            className={classNames(
              "fixed left-0 top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 px-4 lg:px-6"
            )}
          >
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
              "fixed left-0 right-0 top-0 z-30 flex h-16 flex-row pl-12 lg:pl-0",
              !hideSidebar ? "lg:left-80" : "",
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
              titleChildren ? "" : "lg:pt-8"
            )}
          >
            <div
              className={classNames(
                "mx-auto h-full",
                isWideMode ? "w-full" : "max-w-4xl px-6"
              )}
            >
              {children}
            </div>
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
