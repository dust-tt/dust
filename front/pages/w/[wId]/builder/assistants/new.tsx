import { GetServerSideProps, InferGetServerSidePropsType } from "next";

import AssistantBuilder from "@app/components/assistant_builder/AssistantBuilder";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { DataSourceType } from "@app/types/data_source";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  owner: WorkspaceType;
  gaTrackingId: string;
  dataSources: DataSourceType[];
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (
    !owner ||
    !user ||
    !auth.isBuilder() ||
    !isDevelopmentOrDustWorkspace(owner)
  ) {
    return {
      notFound: true,
    };
  }

  const allDataSources = await getDataSources(auth);

  return {
    props: {
      user,
      owner,
      gaTrackingId: GA_TRACKING_ID,
      dataSources: allDataSources,
    },
  };
};

export default function CreateAssistant({
  user,
  owner,
  gaTrackingId,
  dataSources,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AssistantBuilder
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      dataSources={dataSources}
      initialBuilderState={null}
      agentConfigurationId={null}
    />
  );
}
