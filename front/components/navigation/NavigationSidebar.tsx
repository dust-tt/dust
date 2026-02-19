import { TrialMessageUsage } from "@app/components/app/TrialMessageUsage";
import { useWelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuideProvider";
import type {
  SidebarNavigation,
  TabAppLayoutNavigation,
} from "@app/components/navigation/config";
import { getTopNavigationTabs } from "@app/components/navigation/config";
import { HelpDropdown } from "@app/components/navigation/HelpDropdown";
import { useNavigationLoading } from "@app/components/sparkle/NavigationLoadingContext";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { UserMenu } from "@app/components/UserMenu";
import type { AppStatus } from "@app/lib/api/status";
import { FREE_TRIAL_PHONE_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import { useAppStatus } from "@app/lib/swr/useAppStatus";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { SubscriptionType } from "@app/types/plan";
import type { UserTypeWithWorkspaces, WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import {
  CollapseButton,
  classNames,
  cn,
  LinkWrapper,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React, { useCallback, useContext, useMemo, useState } from "react";

interface NavigationSidebarProps {
  children: React.ReactNode;
  owner: WorkspaceType;
  subNavigation?: SidebarNavigation[] | null;
  // TODO(2024-06-19 flav) Move subscription to a hook.
  subscription: SubscriptionType;
  user: (UserTypeWithWorkspaces & { subscriberHash?: string | null }) | null;
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
  const router = useAppRouter();
  const activePath = useMemo(() => {
    if (router.isReady && router.pathname) {
      return router.pathname;
    }
    return "";
  }, [router.isReady, router.pathname]);

  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const { spaceMenuButtonRef } = useWelcomeTourGuide();
  const { showNavigationLoader } = useNavigationLoading();

  const handleTabClick = (tab: TabAppLayoutNavigation) => {
    if (tab.href && !tab.isCurrent(activePath)) {
      showNavigationLoader();
    }
  };

  const handleMenuClick = (href?: string) => {
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

  return (
    <div ref={ref} className="flex min-w-0 grow flex-col">
      <div
        className={cn(
          "flex flex-col gap-2",
          appStatus?.dustStatus ||
            appStatus?.providersStatus ||
            subscription.paymentFailingSince
            ? ""
            : "pt-3"
        )}
      >
        {appStatus && <AppStatusBanner appStatus={appStatus} />}
        {subscription.paymentFailingSince && isAdmin(owner) && (
          <SubscriptionPastDueBanner />
        )}
        {navs.length > 1 && (
          <Tabs value={currentTab?.id ?? "conversations"}>
            <div className="border-b border-separator px-2 dark:border-separator-night">
              <TabsList border={false}>
                {navs.map((tab) => (
                  <div key={tab.id} ref={tab.ref ?? undefined}>
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      label={tab.hideLabel ? undefined : tab.label}
                      tooltip={tab.hideLabel ? tab.label : undefined}
                      icon={tab.icon}
                      href={tab.href}
                      onClick={() => handleTabClick(tab)}
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
            </div>
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
                                onClick={() => handleMenuClick(menu.href)}
                              />
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
      {subscription.plan.code === FREE_TRIAL_PHONE_PLAN_CODE && (
        <div className="mx-3 mb-3">
          <TrialMessageUsage isAdmin={isAdmin(owner)} workspaceId={owner.sId} />
        </div>
      )}
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
  variant?: "info" | "warning" | "success" | "danger";
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
    danger: cn(
      "border-red-200 dark:border-red-200",
      "bg-red-100 dark:bg-red-100",
      "text-red-900 dark:text-red-900"
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

interface AppStatusBannerProps {
  appStatus: AppStatus;
}

function AppStatusBanner({ appStatus }: AppStatusBannerProps) {
  const { providersStatus, dustStatus } = appStatus;

  if (dustStatus) {
    return (
      <StatusBanner
        title={dustStatus.name}
        description={dustStatus.description}
        footer={
          <>
            Check our{" "}
            <LinkWrapper
              href={dustStatus.link}
              target="_blank"
              className="underline"
            >
              status page
            </LinkWrapper>{" "}
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
          <LinkWrapper
            href="https://docs.dust.tt/docs/subscriptions#what-happens-when-we-cancel-our-dust-subscription"
            target="_blank"
            className="underline"
          >
            here
          </LinkWrapper>
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
