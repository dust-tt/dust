import { GetServerSideProps, InferGetServerSidePropsType } from "next";

import AssistantBuilder, {
  AssistantBuilderInitialState,
} from "@app/components/assistant_builder/AssistantBuilder";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { AgentConfigurationType } from "@app/types/assistant/agent";
import { DataSourceType } from "@app/types/data_source";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  owner: WorkspaceType;
  gaTrackingId: string;
  dataSources: DataSourceType[];
  agentConfiguration: AgentConfigurationType;
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
    !isDevelopmentOrDustWorkspace(owner) ||
    !context.params?.aId
  ) {
    return {
      notFound: true,
    };
  }

  const allDataSources = await getDataSources(auth);
  const config = await getAgentConfiguration(
    auth,
    context.params?.aId as string
  );

  if (!config) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user,
      owner,
      gaTrackingId: GA_TRACKING_ID,
      dataSources: allDataSources,
      agentConfiguration: config,
    },
  };
};

export default function EditAssistant({
  user,
  owner,
  gaTrackingId,
  dataSources,
  agentConfiguration,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const selectedDataSource =
    agentConfiguration.action?.type === "retrieval_configuration";

  let timeFrameMode: AssistantBuilderInitialState["timeFrameMode"] = null;
  let timeFrame: AssistantBuilderInitialState["timeFrame"] = null;
  if (selectedDataSource && agentConfiguration.action?.relativeTimeFrame) {
    switch (agentConfiguration.action.relativeTimeFrame) {
      case "auto":
      case "none": // TODO: we don't support "none" in the UI yet
        timeFrameMode = "AUTO";
        break;
      default:
        timeFrameMode = "FORCED";
        timeFrame = {
          value: agentConfiguration.action.relativeTimeFrame.duration,
          unit: agentConfiguration.action.relativeTimeFrame.unit,
        };
    }
  }

  return (
    <AssistantBuilder
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      dataSources={dataSources}
      initialBuilderState={{
        dataSourceMode: selectedDataSource ? "SELECTED" : "GENERIC",
        timeFrameMode,
        timeFrame,
        dataSourceConfigs: selectedDataSource ? {} : null, // TODO
        handle: agentConfiguration.name,
        description: agentConfiguration.description,
        instructions: agentConfiguration.generation?.prompt || "", // TODO we don't support null in the UI yet
      }}
      agentConfigurationId={agentConfiguration.sId}
    />
  );
}
