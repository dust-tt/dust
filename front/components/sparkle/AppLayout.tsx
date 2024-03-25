import { Banner, Item, Logo, Tab, XMarkIcon } from "@dust-tt/sparkle";
import type { SubscriptionType, WorkspaceType } from "@dust-tt/types";
import { Dialog, Transition } from "@headlessui/react";
import { Bars3Icon } from "@heroicons/react/20/solid";
import Head from "next/head";
import Link from "next/link";
import type { NextRouter } from "next/router";
import { useRouter } from "next/router";
import Script from "next/script";
import React, { Fragment, useContext, useEffect, useState } from "react";

import { CONVERSATION_PARENT_SCROLL_DIV_ID } from "@app/components/assistant/conversation/lib";
import type {
  SidebarNavigation,
  TopNavigationId,
} from "@app/components/sparkle/navigation";
import { topNavigation } from "@app/components/sparkle/navigation";
import { UserMenu } from "@app/components/UserMenu";
import WorkspacePicker from "@app/components/WorkspacePicker";
import { getBrowserClient, trackPageView } from "@app/lib/amplitude/browser";
import { useUser } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

/* Set to true when there is an incident, to show the banner (customize
 * IncidentBanner component at bottom of the page)
 */
const SHOW_INCIDENT_BANNER = false;

function NavigationBar({
  owner,
  subscription,
  topNavigationCurrent,
  subNavigation,
  children,
}: {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  topNavigationCurrent: TopNavigationId;
  subNavigation?: SidebarNavigation[] | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const nav = topNavigation({ owner, current: topNavigationCurrent });
  const { user } = useUser();

  return (
    <div className="flex min-w-0 grow flex-col border-r border-structure-200 bg-structure-50">
      <div className="flex flex-col">
        <div className="flex flex-row p-3">
          <div className="flex flex-col gap-2">
            <div className="pt-3">
              <Link
                href={`/w/${owner.sId}/assistant/new`}
                className="inline-flex"
              >
                <Logo className="h-4 w-16" />
              </Link>
            </div>
            {user && user.workspaces.length > 1 ? (
              <div className="flex flex-row gap-2">
                <div className="text-sm text-slate-500">Workspace:</div>
                <WorkspacePicker
                  user={user}
                  workspace={owner}
                  readOnly={false}
                  displayDropDownOrigin="topLeft"
                  onWorkspaceUpdate={(workspace) => {
                    const assistantRoute = `/w/${workspace.sId}/assistant/new`;
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
          {user && <UserMenu user={user} />}
        </div>

        {subscription.endDate && (
          <SubscriptionEndBanner endDate={subscription.endDate} />
        )}
        {subscription.paymentFailingSince && <SubscriptionPastDueBanner />}
        {nav.length > 1 && (
          <div className="pt-2">
            <Tab tabs={nav} />
          </div>
        )}
        {subNavigation && (
          <div className="pt-3">
            {subNavigation.map((nav) => {
              return (
                <div key={nav.id} className="grow py-1 pl-4 pr-3">
                  <Item.List>
                    {nav.label && (
                      <Item.SectionHeader
                        label={nav.label}
                        variant={nav.variant}
                        className="!pt-4"
                      />
                    )}
                    {nav.menus.map((menu) => {
                      return (
                        <React.Fragment key={menu.id}>
                          <Item.Navigation
                            selected={menu.current}
                            label={menu.label}
                            icon={menu.icon}
                            href={menu.href}
                          />
                          {menu.subMenuLabel && (
                            <div className="grow pb-3 pl-14 pr-4 pt-2 text-sm text-xs uppercase text-slate-400">
                              {menu.subMenuLabel}
                            </div>
                          )}
                          {menu.subMenu && (
                            <div className="mb-2 flex flex-col">
                              {menu.subMenu.map((nav) => {
                                return (
                                  <div key={nav.id} className="flex grow">
                                    <Item.Entry
                                      selected={nav.current}
                                      label={nav.label}
                                      icon={nav.icon}
                                      className="TEST grow pl-14 pr-4"
                                      href={nav.href}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </Item.List>
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

export const SidebarContext = React.createContext<{
  sidebarOpen: boolean;
  setSidebarOpen: (value: boolean) => void;
}>({
  sidebarOpen: false,
  setSidebarOpen: (value) => {
    throw new Error("SidebarContext not initialized: " + value);
  },
});

export const SidebarProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <SidebarContext.Provider value={{ sidebarOpen, setSidebarOpen }}>
      {children}
    </SidebarContext.Provider>
  );
};

// This function is used to navigate back to the previous page (eg modal like page close) and
// fallback to the landing if we linked directly to that modal.
export const appLayoutBack = async (
  owner: WorkspaceType,
  router: NextRouter
) => {
  // TODO(2024-02-08 flav) Remove once internal router is in better shape. Opening a new tab/window
  // counts the default page as an entry in the history stack, leading to a history length of 2.
  // Directly opening a link without the "new tab" page results in a history length of 1.
  if (window.history.length < 3) {
    await router.push(`/w/${owner.sId}/assistant/new`);
  } else {
    router.back();
  }
};

export default function AppLayout({
  owner,
  subscription,
  isWideMode = false,
  hideSidebar = false,
  topNavigationCurrent,
  subNavigation,
  pageTitle,
  gaTrackingId,
  navChildren,
  titleChildren,
  children,
}: {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  isWideMode?: boolean;
  hideSidebar?: boolean;
  topNavigationCurrent: TopNavigationId;
  subNavigation?: SidebarNavigation[] | null;
  pageTitle?: string;
  gaTrackingId: string;
  navChildren?: React.ReactNode;
  titleChildren?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { sidebarOpen, setSidebarOpen } = useContext(SidebarContext);
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();
  const user = useUser();

  useEffect(() => {
    setLoaded(true);
  }, []);

  useEffect(() => {
    const amplitude = getBrowserClient();
    if (user?.user?.id) {
      const userId = `user-${user?.user?.id}`;
      amplitude.identify(userId);
      trackPageView({
        pathname: router.pathname,
        workspaceId: owner.sId,
      });
    }
  }, [owner.sId, router.pathname, user?.user?.id]);

  return (
    <>
      <Head>
        <title>{pageTitle ? pageTitle : `Dust - ${owner.name}`}</title>
        <link rel="shortcut icon" href="/static/favicon.png" />

        <meta name="apple-mobile-web-app-title" content="Dust" />
        <link rel="apple-touch-icon" href="/static/AppIcon.png" />
        <link
          rel="apple-touch-icon"
          sizes="60x60"
          href="/static/AppIcon_60.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="76x76"
          href="/static/AppIcon_76.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="120x120"
          href="/static/AppIcon_120.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="152x152"
          href="/static/AppIcon_152.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="167x167"
          href="/static/AppIcon_167.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/static/AppIcon_180.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="192x192"
          href="/static/AppIcon_192.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="228x228"
          href="/static/AppIcon_228.png"
        />

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
                    {loaded && (
                      <NavigationBar
                        subscription={subscription}
                        owner={owner}
                        subNavigation={subNavigation}
                        topNavigationCurrent={topNavigationCurrent}
                      >
                        {navChildren && navChildren}
                      </NavigationBar>
                    )}
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </Dialog>
          </Transition.Root>
        )}

        {!hideSidebar && (
          <div className="hidden lg:fixed lg:inset-y-0 lg:z-0 lg:flex lg:w-80 lg:flex-col">
            {loaded && (
              <NavigationBar
                owner={owner}
                subscription={subscription}
                subNavigation={subNavigation}
                topNavigationCurrent={topNavigationCurrent}
              >
                {loaded && navChildren && navChildren}
              </NavigationBar>
            )}
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
              "fixed left-0 top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 px-4 lg:hidden lg:px-6"
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
              "fixed left-0 right-0 top-0 z-30 flex flex-col pl-12 lg:pl-0",
              !hideSidebar
                ? "border-b border-structure-300/30 bg-white/80 backdrop-blur lg:left-80"
                : "",
              titleChildren ? "fixed" : "lg:hidden"
            )}
          >
            <div className="h-16 grow">
              <div className="mx-auto h-full grow px-6">
                {loaded && titleChildren && titleChildren}
              </div>
            </div>
            {titleChildren && SHOW_INCIDENT_BANNER && <IncidentBanner />}
          </div>

          {!titleChildren && SHOW_INCIDENT_BANNER && (
            <IncidentBanner className="relative" />
          )}
          <main
            id={CONVERSATION_PARENT_SCROLL_DIV_ID.page}
            className={classNames(
              "h-full overflow-x-hidden pt-16",
              titleChildren ? "" : "lg:pt-8"
            )}
          >
            <div
              className={classNames(
                "mx-auto h-full",
                isWideMode ? "w-full" : "max-w-4xl px-6"
              )}
            >
              {loaded && children}
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

function SubscriptionEndBanner({ endDate }: { endDate: number }) {
  const formattedEndDate = new Date(endDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="border-y border-pink-200 bg-pink-100 px-3 py-3 text-xs text-pink-900">
      <div className="font-bold">Subscription ending on {formattedEndDate}</div>
      <div className="font-normal">
        Connections will be deleted and members will be revoked. Details{" "}
        <Link
          href="https://dust-tt.notion.site/What-happens-when-we-cancel-our-Dust-subscription-59aad3866dcc4bbdb26a54e1ce0d848a?pvs=4"
          target="_blank"
          className="underline"
        >
          here
        </Link>
        .
      </div>
    </div>
  );
}

function SubscriptionPastDueBanner() {
  return (
    <div className="border-y border-warning-200 bg-warning-100 px-3 py-3 text-xs text-warning-900">
      <div className="font-bold">Your payment has failed!</div>
      <div className="font-normal">
        <br />
        Please make sure to update your payment method in the Admin section to
        maintain access to your workspace. We will retry in a few days.
        <br />
        <br />
        After 3 attempts, your workspace will be downgraded to the free plan.
        Connections will be deleted and members will be revoked. Details{" "}
        <Link
          href="https://dust-tt.notion.site/What-happens-when-we-cancel-our-Dust-subscription-59aad3866dcc4bbdb26a54e1ce0d848a?pvs=4"
          target="_blank"
          className="underline"
        >
          here
        </Link>
        .
      </div>
    </div>
  );
}

function IncidentBanner({ className = "" }: { className?: string }) {
  return (
    <Banner className={className} variant="incident">
      <div>
        <span className="font-bold">
          OpenAI APIs are encountering a{" "}
          <a
            href="https://status.openai.com/"
            target="_blank"
            className="underline"
          >
            partial outage.
          </a>
        </span>
        <span>
          It may cause slowness and errors from assistants using GPT or data
          retrieval. We are monitoring the situation{" "}
          <a
            href="http://status.dust.tt/"
            target="_blank"
            className="underline"
          >
            here
          </a>
          .
        </span>
      </div>
    </Banner>
  );
}
