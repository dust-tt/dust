import { GetServerSideProps, InferGetServerSidePropsType } from "next";

import AssistantBuilder from "@app/components/assistant_builder/AssistantBuilder";
import { getApps } from "@app/lib/api/app";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { AppType } from "@app/types/app";
import { DataSourceType } from "@app/types/data_source";
import { PlanType, UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  owner: WorkspaceType;
  plan: PlanType;
  gaTrackingId: string;
  dataSources: DataSourceType[];
  dustApps: AppType[];
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const plan = auth.plan();

  if (!owner || !user || !auth.isBuilder() || !plan) {
    return {
      notFound: true,
    };
  }

  const allDataSources = await getDataSources(auth);
  const allDustApps = await getApps(auth);

  return {
    props: {
      user,
      owner,
      plan,
      gaTrackingId: GA_TRACKING_ID,
      dataSources: allDataSources,
      dustApps: allDustApps,
    },
  };
};

export default function CreateAssistant({
  user,
  owner,
  plan,
  gaTrackingId,
  dataSources,
  dustApps,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AssistantBuilder
      user={user}
      owner={owner}
      plan={plan}
      gaTrackingId={gaTrackingId}
      dataSources={dataSources}
      dustApps={dustApps}
      initialBuilderState={null}
      agentConfigurationId={null}
    />
  );
}
