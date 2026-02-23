import type { SubNavigationAppId } from "@app/components/navigation/config";
import { subNavigationApp } from "@app/components/navigation/config";
import {
  useSetContentClassName,
  useSetContentWidth,
  useSetHideSidebar,
  useSetTitle,
} from "@app/components/sparkle/AppLayoutContext";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter, useRequiredPathParam } from "@app/lib/platform";
import { dustAppsListUrl } from "@app/lib/spaces";
import { useApp } from "@app/lib/swr/apps";
import { Spinner, Tabs, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useMemo } from "react";

function getCurrentAppTab(pathname: string): SubNavigationAppId {
  const match = pathname.match(/apps\/[^/]+\/(\w+)/);
  switch (match?.[1]) {
    case "datasets":
      return "datasets";
    case "runs":
      return "runs";
    case "settings":
      return "settings";
    default:
      return "specification";
  }
}

interface DustAppPageLayoutProps {
  children: ReactNode;
}

// TODO: We are not supposed to use z-index for radix components, check why
// code input will go over without z-index.
export function DustAppPageLayout({ children }: DustAppPageLayoutProps) {
  const owner = useWorkspace();
  const router = useAppRouter();
  const spaceId = useRequiredPathParam("spaceId");
  const aId = useRequiredPathParam("aId");

  const { app } = useApp({
    workspaceId: owner.sId,
    spaceId,
    appId: aId,
  });

  const currentTab = useMemo(
    () => getCurrentAppTab(router.asPath),
    [router.asPath]
  );

  const title = useMemo(
    () =>
      app ? (
        <AppLayoutSimpleCloseTitle
          title={app.name}
          onClose={() => {
            void router.push(dustAppsListUrl(owner, app.space));
          }}
        />
      ) : undefined,
    [owner, app, router]
  );

  useSetContentWidth("centered");
  useSetContentClassName("pt-0");
  useSetHideSidebar(true);
  useSetTitle(title);

  if (!app) {
    return <Spinner />;
  }

  return (
    <div className="flex w-full flex-col">
      <Tabs
        value={currentTab}
        className="sticky top-0 z-10 bg-background pt-4 dark:bg-background-night"
      >
        <TabsList>
          {subNavigationApp({ owner, app, current: currentTab }).map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              label={item.label}
              icon={item.icon}
              onClick={() => {
                void router.push(item.href);
              }}
            />
          ))}
        </TabsList>
      </Tabs>
      {children}
    </div>
  );
}
