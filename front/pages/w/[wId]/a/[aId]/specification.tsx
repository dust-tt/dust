import { Tab } from "@dust-tt/sparkle";
import type { AppType, SubscriptionType, WorkspaceType } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import {
  subNavigationApp,
  subNavigationBuild,
} from "@app/components/sparkle/navigation";
import { getApp } from "@app/lib/api/app";
import { Authenticator, getSession } from "@app/lib/auth";
import { dumpSpecification } from "@app/lib/specification";
import logger from "@app/logger/logger";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  readOnly: boolean;
  app: AppType;
  specification: string;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription) {
    return {
      notFound: true,
    };
  }

  const readOnly = !auth.isBuilder();

  const app = await getApp(auth, context.params?.aId as string);

  if (!app) {
    return {
      notFound: true,
    };
  }

  const coreAPI = new CoreAPI(logger);
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
      app,
      specification: spec,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function Specification({
  owner,
  subscription,
  app,
  specification,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistants"
      subNavigation={subNavigationBuild({
        owner,
        current: "developers",
      })}
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title={app.name}
          onClose={() => {
            void router.push(`/w/${owner.sId}/a`);
          }}
        />
      }
      hideSidebar
    >
      <div className="flex w-full flex-col">
        <div className="mt-2 overflow-x-auto scrollbar-hide">
          <Tab
            tabs={subNavigationApp({ owner, app, current: "specification" })}
          />
        </div>
        <div className="font-mono mt-8 whitespace-pre text-[13px] text-gray-700">
          {specification}
        </div>
      </div>
    </AppLayout>
  );
}
