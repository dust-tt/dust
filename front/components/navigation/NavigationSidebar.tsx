import {
  CollapseButton,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import type { SubscriptionType, WorkspaceType } from "@dust-tt/types";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import type { SidebarNavigation } from "@app/components/navigation/config";
import { getTopNavigationTabs } from "@app/components/navigation/config";
import { HelpDropdown } from "@app/components/navigation/HelpDropdown";
import { UserMenu } from "@app/components/UserMenu";
import WorkspacePicker from "@app/components/WorkspacePicker";
import { useAppStatus } from "@app/lib/swr/useAppStatus";
import { useUser } from "@app/lib/swr/user";

interface NavigationSidebarProps {
  children: React.ReactNode;
  owner: WorkspaceType;
  subNavigation?: SidebarNavigation[] | null;
  // TODO(2024-06-19 flav) Move subscription to a hook.
  subscription: SubscriptionType;
}

export const NavigationSidebar = React.forwardRef<
  HTMLDivElement,
  NavigationSidebarProps
>(function NavigationSidebar(
  { owner, subscription, subNavigation, children }: NavigationSidebarProps,
  ref
) {
  const router = useRouter();
  const { user } = useUser();
  const [activePath, setActivePath] = useState("");

  useEffect(() => {
    if (router.isReady && router.route) {
      setActivePath(router.route);
    }
  }, [router.route, router.isReady]);

  // TODO(2024-06-19 flav): Fix issue with AppLayout changing between pagesg
  const navs = useMemo(() => getTopNavigationTabs(owner), [owner]);
  const currentTab = useMemo(
    () => navs.find((n) => n.isCurrent(activePath)),
    [navs, activePath]
  );

  return (
    <div
      ref={ref}
      className="flex min-w-0 grow flex-col bg-structure-50 dark:bg-structure-50-dark"
    >
      <div className="flex flex-col">
        {user && user.workspaces.length > 1 ? (
          <WorkspacePicker
            user={user}
            workspace={owner}
            onWorkspaceUpdate={async (workspace) => {
              const assistantRoute = `/w/${workspace.sId}/assistant/new`;
              if (workspace.id !== owner.id) {
                await router.push(assistantRoute).then(() => router.reload());
              }
            }}
          />
        ) : null}

        <AppStatusBanner />
        {subscription.endDate && (
          <SubscriptionEndBanner endDate={subscription.endDate} />
        )}
        {subscription.paymentFailingSince && <SubscriptionPastDueBanner />}
        {navs.length > 1 && (
          <div className="pt-2">
            <Tabs value={currentTab?.id ?? "conversations"}>
              <TabsList className="px-2">
                {navs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    label={tab.hideLabel ? undefined : tab.label}
                    tooltip={tab.hideLabel ? tab.label : undefined}
                    icon={tab.icon}
                    onClick={() => {
                      if (tab.href) {
                        void router.push(tab.href);
                      }
                    }}
                  />
                ))}
              </TabsList>
              {navs.map((tab) => (
                <TabsContent key={tab.id} value={tab.id}>
                  <NavigationList className="px-3">
                    {subNavigation && tab.isCurrent(activePath) && (
                      <>
                        {subNavigation.map((nav) => (
                          <>
                            {nav.label && (
                              <NavigationListLabel
                                label={nav.label}
                                variant={nav.variant}
                              />
                            )}
                            {nav.menus.map((menu) => (
                              <React.Fragment key={menu.id}>
                                <NavigationListItem
                                  selected={menu.current}
                                  label={menu.label}
                                  icon={menu.icon}
                                  href={menu.href}
                                  target={menu.target}
                                />
                                {menu.subMenuLabel && (
                                  <div className="grow pb-3 pl-14 pr-4 pt-2 text-sm uppercase text-slate-400">
                                    {menu.subMenuLabel}
                                  </div>
                                )}
                                {menu.subMenu && (
                                  <div className="mb-2 flex flex-col">
                                    {menu.subMenu.map((nav) => (
                                      <NavigationListItem
                                        key={nav.id}
                                        selected={nav.current}
                                        label={nav.label}
                                        icon={nav.icon}
                                        className="grow pl-14 pr-4"
                                        href={nav.href ? nav.href : undefined}
                                      />
                                    ))}
                                  </div>
                                )}
                              </React.Fragment>
                            ))}
                          </>
                        ))}
                      </>
                    )}
                  </NavigationList>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}
      </div>
      <div className="flex grow flex-col">{children}</div>
      {user && (
        <div className="flex items-center gap-2 border-t border-border-dark/60 p-2">
          <UserMenu user={user} owner={owner} />
          <div className="flex-grow" />
          <HelpDropdown owner={owner} user={user} />
        </div>
      )}
    </div>
  );
});

function AppStatusBanner() {
  const { appStatus } = useAppStatus();

  if (!appStatus) {
    return null;
  }

  const { providersStatus, dustStatus } = appStatus;

  if (dustStatus) {
    return (
      <div className="space-y-2 border-y border-pink-200 bg-pink-100 px-3 py-3 text-xs text-pink-900">
        <div className="font-bold">{dustStatus.name}</div>
        <div className="font-normal">{dustStatus.description}</div>
        <div>
          Check our{" "}
          <Link href={dustStatus.link} target="_blank" className="underline">
            status page
          </Link>{" "}
          for updates.
        </div>
      </div>
    );
  }
  if (providersStatus) {
    return (
      <div className="space-y-2 border-y border-pink-200 bg-pink-100 px-3 py-3 text-xs text-pink-900">
        <div className="font-bold">{providersStatus.name}</div>
        <div className="font-normal">{providersStatus.description}</div>
      </div>
    );
  }

  return null;
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
          href="https://docs.dust.tt/docs/subscriptions#what-happens-when-we-cancel-our-dust-subscription"
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
          href="https://docs.dust.tt/docs/subscriptions#what-happens-when-we-cancel-our-dust-subscription"
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

interface ToggleNavigationSidebarButtonProps {
  isNavigationBarOpened: boolean;
  toggleNavigationBarVisibility: (isOpened: boolean) => void;
}

export const ToggleNavigationSidebarButton = React.forwardRef<
  HTMLDivElement,
  ToggleNavigationSidebarButtonProps
>(function ToggleSideBarButton(
  {
    isNavigationBarOpened,
    toggleNavigationBarVisibility,
  }: ToggleNavigationSidebarButtonProps,
  ref
) {
  const [direction, setDirection] = useState<"left" | "right">("left");

  const handleClick = useCallback(() => {
    toggleNavigationBarVisibility(!isNavigationBarOpened);
    setDirection((prevDirection) =>
      prevDirection === "left" ? "right" : "left"
    );
  }, [isNavigationBarOpened, toggleNavigationBarVisibility]);

  return (
    <div ref={ref} onClick={handleClick} className="lg:top-1/2 lg:flex lg:w-5">
      <CollapseButton direction={direction} />
    </div>
  );
});
