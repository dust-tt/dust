import {
  classNames,
  cn,
  CollapseButton,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  XMarkIcon,
} from "@dust-tt/sparkle";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useCallback, useContext, useMemo, useState } from "react";

import { useWelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuideProvider";
import type { SidebarNavigation } from "@app/components/navigation/config";
import { getTopNavigationTabs } from "@app/components/navigation/config";
import { HelpDropdown } from "@app/components/navigation/HelpDropdown";
import { useNavigationLoading } from "@app/components/sparkle/NavigationLoadingContext";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { UserMenu } from "@app/components/UserMenu";
import type { AppStatus } from "@app/lib/api/status";
import { isFreePlan } from "@app/lib/plans/plan_codes";
import { useAppStatus } from "@app/lib/swr/useAppStatus";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  SubscriptionType,
  UserTypeWithWorkspaces,
  WorkspaceType,
} from "@app/types";
import { isAdmin } from "@app/types";

interface NavigationSidebarProps {
  children: React.ReactNode;
  owner: WorkspaceType;
  subNavigation?: SidebarNavigation[] | null;
  // TODO(2024-06-19 flav) Move subscription to a hook.
  subscription: SubscriptionType;
  user: UserTypeWithWorkspaces | null;
  isMobile?: boolean;
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
    isMobile,
  }: NavigationSidebarProps,
  ref
) {
  const router = useRouter();
  const activePath = useMemo(() => {
    if (router.isReady && router.route) {
      return router.route;
    }
    return "";
  }, [router.isReady, router.route]);

  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const { spaceMenuButtonRef } = useWelcomeTourGuide();
  const { showNavigationLoader } = useNavigationLoading();

  const handleTabClick = (href?: string) => {
    if (href && href !== router.asPath) {
      showNavigationLoader();
    }
  };

  // TODO(2024-06-19 flav): Fix issue with AppLayout changing between pagesg
  const navs = useMemo(
    () => getTopNavigationTabs(owner, spaceMenuButtonRef),
    [owner, spaceMenuButtonRef]
  );
  const currentTab = useMemo(
    () => navs.find((n) => n.isCurrent(activePath)),
    [navs, activePath]
  );

  const { setSidebarOpen } = useContext(SidebarContext);

  const { appStatus } = useAppStatus();

  const hasIncidentBanner =
    appStatus?.dustStatus !== null || appStatus?.providersStatus !== null;
  const endDate = subscription.endDate;
  const in30Days = Date.now() + 30 * 24 * 60 * 60 * 1000;

  return (
    <div ref={ref} className="flex min-w-0 grow flex-col">
      <div className="flex flex-col gap-2 pt-3">
        {appStatus && <AppStatusBanner appStatus={appStatus} />}
        {!hasIncidentBanner && endDate && endDate < in30Days && (
          <SubscriptionEndBanner
            endDate={endDate}
            isFreePlan={isFreePlan(subscription.plan.code)}
          />
        )}
        {subscription.paymentFailingSince && isAdmin(owner) && (
          <SubscriptionPastDueBanner />
        )}
        {navs.length > 1 && (
          <Tabs value={currentTab?.id ?? "conversations"}>
            <TabsList className="px-2">
              {navs.map((tab) => (
                <div key={tab.id} ref={tab.ref ?? undefined}>
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    label={tab.hideLabel ? undefined : tab.label}
                    tooltip={tab.hideLabel ? tab.label : undefined}
                    icon={tab.icon}
                    href={tab.href}
                    onClick={() => handleTabClick(tab.href)}
                  />
                </div>
              ))}
              {isMobile && (
                <div className="flex flex-grow justify-end">
                  <TabsTrigger
                    value="close-icon"
                    icon={XMarkIcon}
                    onClick={() => setSidebarOpen(false)}
                  />
                </div>
              )}
            </TabsList>
            {navs.map((tab) => (
              <TabsContent key={tab.id} value={tab.id}>
                <NavigationList className="px-3">
                  {subNavigation &&
                    tab.isCurrent(activePath) &&
                    subNavigation.map((nav) => (
                      <React.Fragment key={`nav-${nav.label}`}>
                        {nav.label && (
                          <NavigationListLabel
                            label={nav.label}
                            variant={nav.variant}
                          />
                        )}
                        {nav.menus
                          .filter(
                            (menu) =>
                              !menu.featureFlag ||
                              featureFlags.includes(menu.featureFlag)
                          )
                          .map((menu) => (
                            <React.Fragment key={menu.id}>
                              <NavigationListItem
                                selected={menu.current}
                                label={menu.label}
                                icon={menu.icon}
                                href={menu.href}
                                target={menu.target}
                                onClick={() => handleTabClick(menu.href)}
                              />
                              {menu.subMenuLabel && (
                                <div
                                  className={classNames(
                                    "grow pb-3 pl-14 pr-4 pt-2 text-sm uppercase",
                                    "text-muted-foreground dark:text-muted-foreground-night"
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
                                      onClick={() => handleTabClick(nav.href)}
                                    />
                                  ))}
                                </div>
                              )}
                            </React.Fragment>
                          ))}
                      </React.Fragment>
                    ))}
                </NavigationList>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
      <div className="flex grow flex-col">{children}</div>
      {user && (
        <div
          className={classNames(
            "flex items-center border-t px-2 py-2",
            "border-border-dark dark:border-border-darker-night",
            "text-foreground dark:text-foreground-night"
          )}
        >
          <UserMenu user={user} owner={owner} subscription={subscription} />
          <div className="flex-1" />
          <HelpDropdown owner={owner} user={user} />
        </div>
      )}
    </div>
  );
});

interface StatusBannerProps {
  variant?: "info" | "warning" | "success";
  title: string;
  description: React.ReactNode;
  footer?: React.ReactNode;
}

function StatusBanner({
  variant = "info",
  title,
  description,
  footer,
}: StatusBannerProps) {
  const colorClasses = {
    info: cn(
      "border-info-200 dark:border-info-200-night",
      "bg-info-100 dark:bg-info-100-night",
      "text-info-900 dark:text-info-900-night"
    ),
    warning: cn(
      "border-warning-200 dark:border-warning-200-night",
      "bg-warning-100 dark:bg-warning-100-night",
      "text-warning-900 dark:text-warning-900-night"
    ),
    success: cn(
      "border-success-200 dark:border-success-200-night",
      "bg-success-100 dark:bg-success-100-night",
      "text-success-900 dark:text-success-900-night"
    ),
  };

  return (
    <div
      className={cn(
        "space-y-2 border-y px-3 py-3 text-xs",
        colorClasses[variant]
      )}
    >
      <div className="font-bold">{title}</div>
      <div className="font-normal">{description}</div>
      {footer && <div>{footer}</div>}
    </div>
  );
}

function AppStatusBanner({ appStatus }: { appStatus: AppStatus }) {
  const { providersStatus, dustStatus } = appStatus;

  if (dustStatus) {
    return (
      <StatusBanner
        title={dustStatus.name}
        description={dustStatus.description}
        footer={
          <>
            Check our{" "}
            <Link href={dustStatus.link} target="_blank" className="underline">
              status page
            </Link>{" "}
            for updates.
          </>
        }
      />
    );
  }

  if (providersStatus) {
    return (
      <StatusBanner
        title={providersStatus.name}
        description={providersStatus.description}
      />
    );
  }

  return null;
}

function SubscriptionEndBanner({
  endDate,
  isFreePlan,
}: {
  endDate: number;
  isFreePlan: boolean;
}) {
  const formattedEndDate = new Date(endDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const variant = isFreePlan ? "success" : "info";
  const title = isFreePlan
    ? `Free Trial Ending on ${formattedEndDate}`
    : `Subscription ending on ${formattedEndDate}`;

  return (
    <StatusBanner
      variant={variant}
      title={title}
      description={
        <>
          Your connections and member access will be removed after this date.
          Details{" "}
          <Link
            href="https://docs.dust.tt/docs/subscriptions#what-happens-when-we-cancel-our-dust-subscription"
            target="_blank"
            className="underline"
          >
            here
          </Link>
          .
          {isFreePlan && (
            <p className="mt-2">
              Make the best out of the remaining trial period or contact us to
              subscribe.
            </p>
          )}
        </>
      }
    />
  );
}

function SubscriptionPastDueBanner() {
  return (
    <StatusBanner
      variant="warning"
      title="Your payment has failed!"
      description={
        <>
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
        </>
      }
    />
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
      <CollapseButton direction={direction} variant="light" />
    </div>
  );
});
