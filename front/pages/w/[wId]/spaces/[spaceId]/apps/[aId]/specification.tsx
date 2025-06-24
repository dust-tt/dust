import { Tabs, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import { subNavigationApp } from "@app/components/navigation/config";
import AppContentLayout from "@app/components/sparkle/AppContentLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import config from "@app/lib/api/config";
import { AuthenticatorProvider } from "@app/lib/context/authenticator";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { AppResource } from "@app/lib/resources/app_resource";
import { dustAppsListUrl } from "@app/lib/spaces";
import { dumpSpecification } from "@app/lib/specification";
import logger from "@app/logger/logger";
import type {
  AppType,
  PlanType,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@app/types";
import { CoreAPI } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  user: UserType;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  plan: PlanType | null;
  isAdmin: boolean;
  readOnly: boolean;
  app: AppType;
  specification: string;
  specificationFromCore: { created: number; data: string; hash: string } | null;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user();
  const plan = auth.plan();

  if (!owner || !subscription || !user) {
    return {
      notFound: true,
    };
  }

  const readOnly = !auth.isBuilder();

  const app = await AppResource.fetchById(auth, context.params?.aId as string);

  if (!app) {
    return {
      notFound: true,
    };
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const datasets = await coreAPI.getDatasets({
    projectId: app.dustAPIProjectId,
  });
  if (datasets.isErr()) {
    return {
      notFound: true,
    };
  }

  let specificationFromCore = null;
  const specificationFromCoreHash = context.query?.hash;

  if (
    specificationFromCoreHash &&
    typeof specificationFromCoreHash === "string"
  ) {
    const coreSpec = await coreAPI.getSpecification({
      projectId: app.dustAPIProjectId,
      specificationHash: specificationFromCoreHash,
    });

    if (coreSpec.isOk()) {
      specificationFromCore = {
        ...coreSpec.value.specification,
        hash: specificationFromCoreHash,
      };
    }
  }

  const latestDatasets = {} as { [key: string]: string };
  for (const d in datasets.value.datasets) {
    latestDatasets[d] = datasets.value.datasets[d][0].hash;
  }

  const spec = dumpSpecification(
    JSON.parse(app.savedSpecification || "[]"),
    latestDatasets
  );

  return {
    props: {
      user: user.toJSON(),
      owner,
      subscription,
      readOnly,
      plan,
      isAdmin: auth.isAdmin(),
      app: app.toJSON(),
      specification: spec,
      specificationFromCore,
    },
  };
});

export default function Specification({
  owner,
  subscription,
  app,
  specification,
  specificationFromCore,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  return (
    <AppContentLayout
      subscription={subscription}
      owner={owner}
      hideSidebar
      titleChildren={
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
          <h3>Current specifications : </h3>
          <div className="whitespace-pre font-mono text-sm text-gray-700">
            {specification}
          </div>
          {specificationFromCore && (
            <>
              <h3>Saved specifications {specificationFromCore.hash}: </h3>
              <div className="whitespace-pre font-mono text-sm text-gray-700">
                {specificationFromCore.data}
              </div>
            </>
          )}
        </div>
      </div>
    </AppContentLayout>
  );
}

Specification.getLayout = (
  page: React.ReactElement,
  pageProps: InferGetServerSidePropsType<typeof getServerSideProps>
) => {
  return (
    <AppRootLayout>
      <AuthenticatorProvider value={pageProps}>{page}</AuthenticatorProvider>
    </AppRootLayout>
  );
};
