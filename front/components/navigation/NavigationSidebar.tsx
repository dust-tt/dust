import { Item, Logo, Tab } from "@dust-tt/sparkle";
import type { SubscriptionType, WorkspaceType } from "@dust-tt/types";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useState } from "react";

import type {
  AppLayoutNavigation,
  SidebarNavigation,
} from "@app/components/navigation/config";
import { getTopNavigationTabs } from "@app/components/navigation/config";
import { UserMenu } from "@app/components/UserMenu";
import WorkspacePicker from "@app/components/WorkspacePicker";
import { useUser } from "@app/lib/swr";

interface NavigationSidebarProps {
  children: React.ReactNode;
  owner: WorkspaceType;
  subNavigation?: SidebarNavigation[] | null;
  // TODO(2024-06-19 flav) Move subscription to a hook.
  subscription: SubscriptionType;
}

export function NavigationSidebar({
  owner,
  subscription,
  subNavigation,
  children,
}: NavigationSidebarProps) {
  const router = useRouter();
  const { user } = useUser();

  const [activePath, setActivePath] = useState("");

  useEffect(() => {
    if (router.isReady && router.route) {
      // Update activePath once router is ready.
      setActivePath(router.route);
    }
  }, [router.route, router.isReady]);

  const nav = useMemo(() => getTopNavigationTabs(owner), [owner]);

  const [navs, setNavs] = useState<AppLayoutNavigation[]>([]);

  // TODO(2024-06-19 flav): Fix issue with AppLayout changing between pages
  useEffect(() => {
    setNavs((prevNavs) => {
      const newNavs = nav.map((n) => {
        const current = n.isCurrent(activePath);
        return { ...n, current };
      });

      // Only update navs if the current tab actually changes to prevent blinking effect.
      const isSameCurrent =
        prevNavs.length === newNavs.length &&
        prevNavs.every((prevNav, index) => {
          return prevNav.current === newNavs[index].current;
        });

      return isSameCurrent ? prevNavs : newNavs;
    });
  }, [nav, activePath]);

  return (
    <div className="flex min-w-0 grow flex-col border-r border-structure-200 bg-structure-50">
      <div className="flex flex-col">
        <div className="flex flex-row justify-between p-3">
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
          {user && <UserMenu user={user} owner={owner} />}
        </div>

        {subscription.endDate && (
          <SubscriptionEndBanner endDate={subscription.endDate} />
        )}
        {subscription.paymentFailingSince && <SubscriptionPastDueBanner />}
        {nav.length > 1 && (
          <div className="pt-2">
            <Tab tabs={navs} />
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
