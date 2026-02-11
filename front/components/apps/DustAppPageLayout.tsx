import { Tabs, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

import { subNavigationApp } from "@app/components/navigation/config";
import { AppContentLayout } from "@app/components/sparkle/AppContentLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useAppRouter } from "@app/lib/platform";
import { dustAppsListUrl } from "@app/lib/spaces";
import type { AppType } from "@app/types/app";
import type { SubscriptionType } from "@app/types/plan";
import type { WorkspaceType } from "@app/types/user";

interface DustAppPageLayoutProps {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  app: AppType;
  currentTab: "specification" | "runs" | "settings" | "datasets";
  children: ReactNode;
}

// TODO: We are not supposed to use z-index for radix components, check why
// code input will go over without z-index.
export function DustAppPageLayout({
  owner,
  subscription,
  app,
  currentTab,
  children,
}: DustAppPageLayoutProps) {
  const router = useAppRouter();

  return (
    <AppContentLayout
      contentWidth="centered"
      contentClassName="pt-0"
      subscription={subscription}
      owner={owner}
      hideSidebar
      title={
        <AppLayoutSimpleCloseTitle
          title={app.name}
          onClose={() => {
            void router.push(dustAppsListUrl(owner, app.space));
          }}
        />
      }
    >
      <div className="flex w-full flex-col">
        <Tabs
          value={currentTab}
          className="sticky top-0 z-10 bg-background pt-4 dark:bg-background-night"
        >
          <TabsList>
            {subNavigationApp({ owner, app, current: currentTab }).map(
              (item) => (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  label={item.label}
                  icon={item.icon}
                  onClick={() => {
                    void router.push(item.href);
                  }}
                />
              )
            )}
          </TabsList>
        </Tabs>
        {children}
      </div>
    </AppContentLayout>
  );
}
