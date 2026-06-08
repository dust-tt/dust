import { TrialMessageUsage } from "@app/components/app/TrialMessageUsage";
import { useWelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuideProvider";
import { SidebarBanners } from "@app/components/navigation/AppStatusBanner";
import type { SidebarNavigation } from "@app/components/navigation/config";
import { getTopNavigationTabs } from "@app/components/navigation/config";
import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
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
  LayoutLeft,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  NavTabPill,
  NavTabPillContent,
  NavTabPillList,
  NavTabPillTrigger,
  XClose,
} from "@dust-tt/sparkle";
import React, { useCallback, useContext, useMemo } from "react";

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
  const { setIsNavigationBarOpen } = useDesktopNavigation();

  return (
    <div ref={ref} className="flex min-w-0 grow flex-col">
      <div className={cn("flex flex-col gap-3")}>
        <div className={cn("flex flex-col gap-2")}>
          <SidebarBanners />
        </div>
        {navs.length > 1 && (
          <NavTabPill
            value={currentTab?.id ?? "conversations"}
            className="mx-sidebar-side-spacing"
          >
            <NavTabPillList>
              {navs.map((tab) => (
                <div key={tab.id} ref={tab.ref ?? undefined}>
                  <NavTabPillTrigger
                    value={tab.id}
                    icon={tab.icon}
                    href={tab.href}
                  >
                    {tab.label}
                  </NavTabPillTrigger>
                </div>
              ))}
              <div className="flex flex-grow justify-end">
                {isMobile ? (
                  <NavTabPillTrigger
                    value="close-icon"
                    icon={XClose}
                    onClick={() => setSidebarOpen(false)}
                  />
                ) : (
                  <NavTabPillTrigger
                    icon={LayoutLeft}
                    value="close-icon"
                    onClick={() => setIsNavigationBarOpen(false)}
                  />
                )}
              </div>
            </NavTabPillList>
            {navs.map((tab) => (
              <NavTabPillContent key={tab.id} value={tab.id}>
                <NavigationList>
                  {subNavigation &&
                    tab.isCurrent(activePath) &&
                    subNavigation.map((nav) => (
                      <React.Fragment key={`nav-${nav.label}`}>
                        {nav.label && <NavigationListLabel label={nav.label} />}
                        {nav.menus
                          .filter(
                            (menu) =>
                              !menu.featureFlag ||
                              featureFlags.includes(menu.featureFlag)
                          )
                          .map((menu) => (
                            <NavigationListItem
                              key={menu.id}
                              selected={menu.current}
                              label={menu.label}
                              icon={menu.icon}
                              href={menu.href}
                              target={menu.target}
                            />
                          ))}
                      </React.Fragment>
                    ))}
                </NavigationList>
              </NavTabPillContent>
            ))}
          </NavTabPill>
        )}
      </div>
      <div className="flex grow flex-col">{children}</div>
      {subscription.plan.code === FREE_TRIAL_PHONE_PLAN_CODE && (
        <div className="mx-3 mb-3">
          <TrialMessageUsage isAdmin={isAdmin(owner)} workspaceId={owner.sId} />
        </div>
      )}
      {user && (
        <UserMenu user={user} owner={owner} subscription={subscription} />
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
  const handleClick = useCallback(() => {
    toggleNavigationBarVisibility(!isNavigationBarOpened);
  }, [isNavigationBarOpened, toggleNavigationBarVisibility]);

  if (isNavigationBarOpened) {
    return null;
  }

  return (
    <div ref={ref} onClick={handleClick} className="lg:top-1/2 lg:flex lg:w-5">
      <CollapseButton
        direction={isNavigationBarOpened ? "left" : "right"}
        variant="light"
      />
    </div>
  );
});
