import { TrialMessageUsage } from "@app/components/app/TrialMessageUsage";
import { useWelcomeTourGuide } from "@app/components/assistant/WelcomeTourGuideProvider";
import { AdminSettingsSearchNav } from "@app/components/navigation/AdminSettingsSearchNav";
import type { SidebarNavigation } from "@app/components/navigation/config";
import {
  getAdminSectionHref,
  getTopNavigationTabs,
} from "@app/components/navigation/config";
import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
import { SidebarUserMenu } from "@app/components/navigation/SidebarUserMenu";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { FREE_TRIAL_PHONE_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { hasGroupManagementScope } from "@app/types/api/auth_context";
import type { SubscriptionType } from "@app/types/plan";
import type { UserTypeWithWorkspaces, WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import {
  CollapseButton,
  cn,
  LayoutLeft,
  NavigationList,
  NavigationListCompactLabel,
  NavigationListItem,
  NavTabPill,
  NavTabPillContent,
  NavTabPillList,
  NavTabPillTrigger,
  XClose,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
  const router = useAppRouter();
  const activePath = useMemo(() => {
    if (router.isReady && router.pathname) {
      return router.pathname;
    }
    return "";
  }, [router.isReady, router.pathname]);

  const { hasFeature } = useFeatureFlags();
  const { groupManagement } = useAuth();
  const { hasPermission } = useWorkspacePermissions();

  const hasManagedGroups = hasGroupManagementScope(groupManagement?.read_usage);
  const adminSectionHref = getAdminSectionHref(
    owner,
    hasPermission,
    hasManagedGroups
  );

  const showAdminSection = adminSectionHref !== null;

  const { spaceMenuButtonRef } = useWelcomeTourGuide();

  // TODO(2024-06-19 flav): Fix issue with AppLayout changing between pagesg
  const navs = useMemo(
    () =>
      getTopNavigationTabs(
        owner,
        spaceMenuButtonRef,
        showAdminSection,
        adminSectionHref,
        t
      ),
    [owner, spaceMenuButtonRef, showAdminSection, adminSectionHref, t]
  );

  const currentTab = useMemo(
    () => navs.find((n) => n.isCurrent(activePath)),
    [navs, activePath]
  );

  const { setSidebarOpen } = useContext(SidebarContext);
  const { setIsNavigationBarOpen } = useDesktopNavigation();

  const isAdminTab = currentTab?.id === "settings";

  return (
    <div ref={ref} className="flex min-w-0 grow flex-col pt-2">
      <div className={cn("flex flex-col gap-3")}>
        {navs.length > 1 && (
          <NavTabPill value={currentTab?.id ?? "conversations"}>
            <NavTabPillList className="mx-sidebar-side-spacing">
              {navs.map((tab) => (
                <div key={tab.id} ref={tab.ref ?? undefined}>
                  <NavTabPillTrigger
                    className="notranslate"
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
              // NavTabPillContent is display:contents, so it generates no box
              // and margins set on it do nothing — the side spacing has to go
              // on the list itself, as the other tabs' menus already do.
              <NavTabPillContent key={tab.id} value={tab.id}>
                <div className="mx-sidebar-side-spacing pt-sidebar-side-spacing">
                  {subNavigation &&
                    tab.isCurrent(activePath) &&
                    (isAdminTab ? (
                      <AdminSettingsSearchNav
                        subNavigation={subNavigation}
                        hasFeature={hasFeature}
                      />
                    ) : (
                      <NavigationList>
                        {subNavigation.map((nav) => (
                          <React.Fragment key={`nav-${nav.id}`}>
                            {nav.label && (
                              <NavigationListCompactLabel label={nav.label} />
                            )}
                            {nav.menus
                              .filter(
                                (menu) =>
                                  !menu.featureFlag ||
                                  hasFeature(menu.featureFlag)
                              )
                              .map((menu) => (
                                <NavigationListItem
                                  key={menu.id}
                                  selected={menu.current}
                                  disabled={menu.disabled}
                                  label={menu.label}
                                  icon={menu.icon}
                                  href={menu.href}
                                  target={menu.target}
                                />
                              ))}
                          </React.Fragment>
                        ))}
                      </NavigationList>
                    ))}
                </div>
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
        <SidebarUserMenu
          user={user}
          owner={owner}
          subscription={subscription}
          isFairUseAwuLimitDisabled={hasFeature("disable_fair_use_awu_limit")}
        />
      )}
    </div>
  );
});

interface ToggleNavigationSidebarButtonProps {
  isNavigationBarOpened: boolean;
  isFullScreen: boolean;
  toggleNavigationBarVisibility: (isOpened: boolean) => void;
}

export const ToggleNavigationSidebarButton = React.forwardRef<
  HTMLDivElement,
  ToggleNavigationSidebarButtonProps
>(function ToggleSideBarButton(
  {
    isNavigationBarOpened,
    isFullScreen,
    toggleNavigationBarVisibility,
  }: ToggleNavigationSidebarButtonProps,
  ref
) {
  const handleClick = useCallback(() => {
    toggleNavigationBarVisibility(!isNavigationBarOpened);
  }, [isNavigationBarOpened, toggleNavigationBarVisibility]);

  if (isNavigationBarOpened || isFullScreen) {
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
