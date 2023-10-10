import { GetServerSideProps, InferGetServerSidePropsType } from "next";

import AssistantBuilder, {
  AssistantBuilderInitialState,
} from "@app/components/assistant_builder/AssistantBuilder";
import { getApps } from "@app/lib/api/app";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { ConnectorsAPI } from "@app/lib/connectors_api";
import { AppType } from "@app/types/app";
import { isDustAppRunConfiguration } from "@app/types/assistant/actions/dust_app_run";
import { isRetrievalConfiguration } from "@app/types/assistant/actions/retrieval";
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
  dustApps: AppType[];
  dustAppConfiguration: AssistantBuilderInitialState["dustAppConfiguration"];
  agentConfiguration: AgentConfigurationType;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner || !user || !auth.isBuilder() || !context.params?.aId) {
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
    isSelectAll: boolean;
  }[] = [];

  if (isRetrievalConfiguration(config.action)) {
    for (const ds of config.action.dataSources) {
      selectedResources.push({
        dataSourceName: ds.dataSourceId,
        resources: ds.filter.parents?.in ?? null,
        isSelectAll: !ds.filter.parents,
      });
    }
  }

  const dataSourceConfigurationsArray: DataSourceConfig[] = await Promise.all(
    selectedResources.map(async (ds): Promise<DataSourceConfig> => {
      const dataSource = dataSourceByName[ds.dataSourceName];
      if (!dataSource.connectorId || !ds.resources) {
        return {
          dataSource: dataSource,
          selectedResources: {},
          isSelectAll: ds.isSelectAll,
        };
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
        isSelectAll: ds.isSelectAll,
      };
    })
  );

  // key: dataSourceName, value: DataSourceConfig
  const dataSourceConfigurations = dataSourceConfigurationsArray.reduce(
    (acc, curr) => ({ ...acc, [curr.dataSource.name]: curr }),
    {} as Record<string, DataSourceConfig>
  );

  const allDustApps = await getApps(auth);

  let dustAppConfiguration: AssistantBuilderInitialState["dustAppConfiguration"] =
    null;

  if (isDustAppRunConfiguration(config.action)) {
    for (const app of allDustApps) {
      if (app.sId === config.action.appId) {
        dustAppConfiguration = {
          app,
        };
        break;
      }
    }
  }

  return {
    props: {
      user,
      owner,
      gaTrackingId: GA_TRACKING_ID,
      dataSources: allDataSources,
      dataSourceConfigurations,
      dustApps: allDustApps,
      dustAppConfiguration,
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
  dustApps,
  dustAppConfiguration,
  agentConfiguration,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  let filteringMode: AssistantBuilderInitialState["filteringMode"] = null;
  let timeFrame: AssistantBuilderInitialState["timeFrame"] = null;
  let dataSourceMode: AssistantBuilderInitialState["dataSourceMode"] =
    "GENERIC";

  if (isRetrievalConfiguration(agentConfiguration.action)) {
    dataSourceMode = "SELECTED";
    if (agentConfiguration.action?.relativeTimeFrame) {
      switch (agentConfiguration.action.relativeTimeFrame) {
        case "auto":
          filteringMode = "SEARCH";
          break;
        case "none":
          filteringMode = "SEARCH";
          break;
        default:
          filteringMode = "TIMEFRAME";
          timeFrame = {
            value: agentConfiguration.action.relativeTimeFrame.duration,
            unit: agentConfiguration.action.relativeTimeFrame.unit,
          };
      }
    }
  }

  let dustAppMode: AssistantBuilderInitialState["dustAppMode"] = "GENERIC";

  if (isDustAppRunConfiguration(agentConfiguration.action)) {
    dustAppMode = "SELECTED";
  }

  return (
    <AssistantBuilder
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      dataSources={dataSources}
      dustApps={dustApps}
      initialBuilderState={{
        dataSourceMode,
        filteringMode,
        timeFrame,
        dataSourceConfigurations,
        dustAppMode,
        dustAppConfiguration,
        handle: agentConfiguration.name,
        description: agentConfiguration.description,
        instructions: agentConfiguration.generation?.prompt || "", // TODO we don't support null in the UI yet
        avatarUrl: agentConfiguration.pictureUrl,
        generationSettings: agentConfiguration.generation
          ? {
              modelSettings: agentConfiguration.generation.model,
              temperature: agentConfiguration.generation.temperature,
            }
          : null,
      }}
      agentConfigurationId={agentConfiguration.sId}
    />
  );
}
