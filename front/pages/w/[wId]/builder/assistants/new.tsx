import { DataSourceType } from "@dust-tt/types";
import { UserType, WorkspaceType } from "@dust-tt/types";
import { AppType } from "@dust-tt/types";
import { PlanType, SubscriptionType } from "@dust-tt/types";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";

import AssistantBuilder from "@app/components/assistant_builder/AssistantBuilder";
import { getApps } from "@app/lib/api/app";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  owner: WorkspaceType;
  subscription: SubscriptionType;
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
  const subscription = auth.subscription();
  if (!owner || !plan || !user || !auth.isBuilder() || !subscription) {
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
      subscription,
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
  subscription,
  plan,
  gaTrackingId,
  dataSources,
  dustApps,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AssistantBuilder
      user={user}
      owner={owner}
      subscription={subscription}
      plan={plan}
      gaTrackingId={gaTrackingId}
      dataSources={dataSources}
      dustApps={dustApps}
      initialBuilderState={null}
      agentConfigurationId={null}
    />
  );
}
