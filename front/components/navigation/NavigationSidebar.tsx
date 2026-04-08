import { TrialMessageUsage } from "@app/components/app/TrialMessageUsage";
import { useWelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuideProvider";
import { SidebarBanners } from "@app/components/navigation/AppStatusBanner";
import type { SidebarNavigation } from "@app/components/navigation/config";
import { getTopNavigationTabs } from "@app/components/navigation/config";
import { HelpDropdown } from "@app/components/navigation/HelpDropdown";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { UserMenu } from "@app/components/UserMenu";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { FREE_TRIAL_PHONE_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import type { SubscriptionType } from "@app/types/plan";
import type { UserTypeWithWorkspaces, WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import {
  CollapseButton,
  cn,
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

  const { featureFlags } = useFeatureFlags();

  const { spaceMenuButtonRef } = useWelcomeTourGuide();

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

  return (
    <div ref={ref} className="flex min-w-0 grow flex-col">
      <div className={cn("flex flex-col gap-3")}>
        <div className={cn("flex flex-col gap-2")}>
          <SidebarBanners />
        </div>
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
          className={cn(
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
