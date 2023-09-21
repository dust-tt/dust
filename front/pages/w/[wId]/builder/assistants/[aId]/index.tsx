import { GetServerSideProps, InferGetServerSidePropsType } from "next";

import AssistantBuilder, {
  AssistantBuilderInitialState,
} from "@app/components/assistant_builder/AssistantBuilder";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { ConnectorsAPI } from "@app/lib/connectors_api";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { AgentConfigurationType } from "@app/types/assistant/agent";
import { DataSourceType } from "@app/types/data_source";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

type DataSourceConfig = NonNullable<
  AssistantBuilderInitialState["dataSourceConfigurations"]
>[string];

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  owner: WorkspaceType;
  gaTrackingId: string;
  dataSources: DataSourceType[];
  dataSourceConfigurations: Record<string, DataSourceConfig>;
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
  const dataSourceByName = allDataSources.reduce(
    (acc, ds) => ({ ...acc, [ds.name]: ds }),
    {} as Record<string, DataSourceType>
  );

  const config = await getAgentConfiguration(
    auth,
    context.params?.aId as string
  );

  if (!config) {
    return {
      notFound: true,
    };
  }

  const selectedResources: {
    dataSourceName: string;
    resources: string[] | null;
  }[] = [];
  for (const ds of config.action?.dataSources ?? []) {
    selectedResources.push({
      dataSourceName: ds.dataSourceId,
      resources: ds.filter.parents?.in ?? null,
    });
  }

  const dataSourceConfigurationsArray: DataSourceConfig[] = await Promise.all(
    selectedResources.map(async (ds): Promise<DataSourceConfig> => {
      const dataSource = dataSourceByName[ds.dataSourceName];
      if (!dataSource.connectorId || !ds.resources) {
        return { dataSource: dataSource, selectedResources: {} };
      }
      const response = await ConnectorsAPI.getResourcesTitles({
        connectorId: dataSource.connectorId,
        resourceInternalIds: ds.resources,
      });

      if (response.isErr()) {
        throw response.error;
      }

      // key: interalId, value: title
      const selectedResources: Record<string, string> = {};
      for (const resource of response.value.resources) {
        selectedResources[resource.internalId] = resource.title;
      }

      return {
        dataSource: dataSource,
        selectedResources,
      };
    })
  );

  // key: dataSourceName, value: DataSourceConfig
  const dataSourceConfigurations = dataSourceConfigurationsArray.reduce(
    (acc, curr) => ({ ...acc, [curr.dataSource.name]: curr }),
    {} as Record<string, DataSourceConfig>
  );

  return {
    props: {
      user,
      owner,
      gaTrackingId: GA_TRACKING_ID,
      dataSources: allDataSources,
      dataSourceConfigurations,
      agentConfiguration: config,
    },
  };
};

export default function EditAssistant({
  user,
  owner,
  gaTrackingId,
  dataSources,
  dataSourceConfigurations,
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
      dataSources={Object.values(dataSources)}
      initialBuilderState={{
        dataSourceMode: selectedDataSource ? "SELECTED" : "GENERIC",
        timeFrameMode,
        timeFrame,
        dataSourceConfigurations, // TODO
        handle: agentConfiguration.name,
        description: agentConfiguration.description,
        instructions: agentConfiguration.generation?.prompt || "", // TODO we don't support null in the UI yet
        avatarUrl: agentConfiguration.pictureUrl,
        modelSettings: agentConfiguration.generation
          ? {
              modelId: agentConfiguration.generation?.model.modelId,
              modelProviderId: agentConfiguration.generation?.model.providerId,
              temperature: agentConfiguration.generation?.temperature,
            }
          : null,
      }}
      agentConfigurationId={agentConfiguration.sId}
    />
  );
}
