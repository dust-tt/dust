import { Spinner, Tabs, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useMemo } from "react";

import { subNavigationApp } from "@app/components/navigation/config";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { dustAppsListUrl } from "@app/lib/spaces";
import { dumpSpecification } from "@app/lib/specification";
import { useApp } from "@app/lib/swr/apps";
import type { SpecificationType } from "@app/types";
import { isString } from "@app/types";

export const getServerSideProps = appGetServerSideProps;

function Specification() {
  const router = useRouter();
  const { spaceId, aId } = router.query;
  const owner = useWorkspace();
  const { subscription } = useAuth();

  const { app, isAppLoading } = useApp({
    workspaceId: owner.sId,
    spaceId: isString(spaceId) ? spaceId : "",
    appId: isString(aId) ? aId : "",
    disabled: !isString(spaceId) || !isString(aId),
  });

  // Compute the specification string from the app's saved specification
  const specification = useMemo(() => {
    if (!app) {
      return "";
    }
    try {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const spec = JSON.parse(
        app.savedSpecification || "[]"
      ) as SpecificationType;
      // Note: We don't have access to latestDatasets here, so we pass an empty object.
      // This means dataset hashes won't be shown, but the specification structure will be correct.
      return dumpSpecification(spec, {});
    } catch {
      return "";
    }
  }, [app]);

  if (isAppLoading || !app) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <AppCenteredLayout
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
    </AppCenteredLayout>
  );
}

const PageWithAuthLayout = Specification as AppPageWithLayout;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>{page}</AppAuthContextLayout>
  );
};

export default PageWithAuthLayout;
