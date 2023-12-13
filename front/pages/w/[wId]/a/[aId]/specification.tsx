import { Tab } from "@dust-tt/sparkle";
import { UserType, WorkspaceType } from "@dust-tt/types";
import { AppType } from "@dust-tt/types";
import { SubscriptionType } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import {
  subNavigationAdmin,
  subNavigationApp,
} from "@app/components/sparkle/navigation";
import { getApp } from "@app/lib/api/app";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { dumpSpecification } from "@app/lib/specification";
import logger from "@app/logger/logger";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  readOnly: boolean;
  app: AppType;
  specification: string;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
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
      user,
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
  user,
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
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="admin"
      subNavigation={subNavigationAdmin({
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
