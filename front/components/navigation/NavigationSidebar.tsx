import {
  classNames,
  CollapseButton,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import type {
  SubscriptionType,
  UserTypeWithWorkspaces,
  WorkspaceType,
} from "@dust-tt/types";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import type { SidebarNavigation } from "@app/components/navigation/config";
import { getTopNavigationTabs } from "@app/components/navigation/config";
import { HelpDropdown } from "@app/components/navigation/HelpDropdown";
import { UserMenu } from "@app/components/UserMenu";
import { useAppStatus } from "@app/lib/swr/useAppStatus";

interface NavigationSidebarProps {
  children: React.ReactNode;
  owner: WorkspaceType;
  subNavigation?: SidebarNavigation[] | null;
  // TODO(2024-06-19 flav) Move subscription to a hook.
  subscription: SubscriptionType;
  user: UserTypeWithWorkspaces | null;
}

export const NavigationSidebar = React.forwardRef<
  HTMLDivElement,
  NavigationSidebarProps
>(function NavigationSidebar(
  {
    owner,
    subscription,
    subNavigation,
    children,
    user,
  }: NavigationSidebarProps,
  ref
) {
  const router = useRouter();
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
      className={classNames(
        "flex min-w-0 grow flex-col",
        "bg-structure-50 dark:bg-structure-50-night"
      )}
    >
      <div className="flex flex-col">
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
                                  <div
                                    className={classNames(
                                      "grow pb-3 pl-14 pr-4 pt-2 text-sm uppercase",
                                      "text-slate-400 dark:text-slate-400-night"
                                    )}
                                  >
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
        <div
          className={classNames(
            "flex items-center gap-2 border-t p-2",
            "border-border-dark/60 dark:border-border-dark-night/60",
            "text-foreground dark:text-foreground-night"
          )}
        >
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
      <div
        className={classNames(
          "space-y-2 border-y px-3 py-3 text-xs",
          "border-pink-200 dark:border-pink-200-night",
          "bg-pink-100 dark:bg-pink-100-night",
          "text-pink-900 dark:text-pink-900-night"
        )}
      >
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
      <div
        className={classNames(
          "space-y-2 border-y px-3 py-3 text-xs",
          "border-pink-200 dark:border-pink-200-night",
          "bg-pink-100 dark:bg-pink-100-night",
          "text-pink-900 dark:text-pink-900-night"
        )}
      >
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
    <div
      className={classNames(
        "border-y px-3 py-3 text-xs",
        "border-pink-200 dark:border-pink-200-night",
        "bg-pink-100 dark:bg-pink-100-night",
        "text-pink-900 dark:text-pink-900-night"
      )}
    >
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
    <div
      className={classNames(
        "border-y px-3 py-3 text-xs",
        "border-warning-200 dark:border-warning-200-night",
        "bg-warning-100 dark:bg-warning-100-night",
        "text-warning-900 dark:text-warning-900-night"
      )}
    >
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
