import { Spinner, Tabs, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import { useMemo } from "react";

import { subNavigationApp } from "@app/components/navigation/config";
import { useAppLayoutConfig } from "@app/components/sparkle/AppLayoutContext";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter, useRequiredPathParam } from "@app/lib/platform";
import { dustAppsListUrl } from "@app/lib/spaces";
import { dumpSpecification } from "@app/lib/specification";
import { useApp } from "@app/lib/swr/apps";
import Custom404 from "@app/pages/404";
import type { SpecificationType } from "@app/types/app";

export function AppSpecificationPage() {
  const router = useAppRouter();
  const spaceId = useRequiredPathParam("spaceId");
  const aId = useRequiredPathParam("aId");
  const owner = useWorkspace();

  const { app, isAppLoading, isAppError } = useApp({
    workspaceId: owner.sId,
    spaceId,
    appId: aId,
  });

  // Compute the specification string from the app's saved specification
  const specification = useMemo(() => {
    if (!app) {
      return "";
    }
    try {
      const spec = JSON.parse(
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        app.savedSpecification || "[]"
      ) as SpecificationType;
      // Note: We don't have access to latestDatasets here, so we pass an empty object.
      // This means dataset hashes won't be shown, but the specification structure will be correct.
      return dumpSpecification(spec, {});
    } catch {
      return "";
    }
  }, [app]);

  useAppLayoutConfig(
    () => ({
      contentWidth: "centered",
      hideSidebar: true,
      title: app ? (
        <AppLayoutSimpleCloseTitle
          title={app.name}
          onClose={() => {
            void router.push(dustAppsListUrl(owner, app.space));
          }}
        />
      ) : undefined,
    }),
    [owner, app, router]
  );

  return (
    <>
      {isAppError || (!isAppLoading && !app) ? (
        <Custom404 />
      ) : isAppLoading || !app ? (
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="flex w-full flex-col">
          <Tabs value="specification" className="mt-2">
            <TabsList>
              {subNavigationApp({ owner, app, current: "specification" }).map(
                (tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    label={tab.label}
                    icon={tab.icon}
                    onClick={() => {
                      if (tab.href) {
                        void router.push(tab.href);
                      }
                    }}
                  />
                )
              )}
            </TabsList>
          </Tabs>
          <div className="mt-8 flex flex-col gap-4">
            <h3>Current specifications:</h3>
            <div className="whitespace-pre font-mono text-sm text-gray-700">
              {specification}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
