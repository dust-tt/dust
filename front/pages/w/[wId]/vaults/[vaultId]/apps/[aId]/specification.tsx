import { Tab } from "@dust-tt/sparkle";
import type { AppType, SubscriptionType, WorkspaceType } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import {
  subNavigationApp,
  subNavigationBuild,
} from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { AppResource } from "@app/lib/resources/app_resource";
import { dumpSpecification } from "@app/lib/specification";
import { dustAppsListUrl } from "@app/lib/vaults";
import logger from "@app/logger/logger";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  readOnly: boolean;
  app: AppType;
  specification: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription) {
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
      owner,
      subscription,
      readOnly,
      app: app.toJSON(),
      specification: spec,
    },
  };
});

export default function Specification({
  owner,
  subscription,
  app,
  specification,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationBuild({
        owner,
        current: "developers",
      })}
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title={app.name}
          onClose={() => {
            void router.push(dustAppsListUrl(owner, app.vault));
          }}
        />
      }
      hideSidebar
    >
      <div className="flex w-full flex-col">
        <Tab
          className="mt-2"
          tabs={subNavigationApp({ owner, app, current: "specification" })}
        />
        <div className="font-mono mt-8 whitespace-pre text-[13px] text-gray-700">
          {specification}
        </div>
      </div>
    </AppLayout>
  );
}
