import { GetServerSideProps, InferGetServerSidePropsType } from "next";

import MainTab from "@app/components/app/MainTab";
import AppLayout from "@app/components/AppLayout";
import { getApp } from "@app/lib/api/app";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { CoreAPI } from "@app/lib/core_api";
import { dumpSpecification } from "@app/lib/specification";
import { AppType } from "@app/types/app";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
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
  if (!owner) {
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

  const datasets = await CoreAPI.getDatasets({
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
  app,
  specification,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AppLayout user={user} owner={owner} app={app} gaTrackingId={gaTrackingId}>
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab app={app} currentTab="Specification" owner={owner} />
        </div>
        <div className="w-max-4xl mx-auto">
          <div className="flex flex-auto">
            <div className="my-8 flex flex-auto flex-col">
              <div className="font-mono whitespace-pre text-[13px] text-gray-700">
                {specification}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
