import type { AgentActionConfigurationType, ModelId } from "@dust-tt/types";
import _ from "lodash";
import { Op } from "sequelize";

import { DEFAULT_RETRIEVAL_ACTION_NAME } from "@app/lib/api/assistant/actions/names";
import { renderRetrievalTimeframeType } from "@app/lib/api/assistant/configuration/helpers";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { AgentRetrievalConfiguration } from "@app/lib/models/assistant/actions/retrieval";
import { DataSource } from "@app/lib/models/data_source";
import { Workspace } from "@app/lib/models/workspace";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";

function groupByAgentConfigurationId<
  T extends { agentConfigurationId: number },
>(list: T[]): Record<number, T[]> {
  return _.groupBy(list, "agentConfigurationId");
}

export async function fetchAgentRetrievalConfigurationsActions({
  configurationIds,
  variant,
}: {
  configurationIds: ModelId[];
  variant: "light" | "full";
}): Promise<Map<ModelId, AgentActionConfigurationType[]>> {
  if (variant !== "full") {
    return new Map();
  }

  // Find the retrieval configurations for the given agent configurations.
  const retrievalConfigurationIds = await AgentRetrievalConfiguration.findAll({
    where: { agentConfigurationId: { [Op.in]: configurationIds } },
  });

  if (retrievalConfigurationIds.length === 0) {
    return new Map();
  }

  // Find the associated data sources configurations.
  const retrievalDatasourceConfigurations =
    await AgentDataSourceConfiguration.findAll({
      where: {
        retrievalConfigurationId: {
          [Op.in]: retrievalConfigurationIds.map((r) => r.id),
        },
      },
      include: [
        {
          model: DataSource,
          as: "dataSource",
          include: [
            {
              model: Workspace,
              as: "workspace",
            },
          ],
        },
        {
          model: DataSourceViewModel,
          as: "dataSourceView",
          include: [
            {
              model: Workspace,
              as: "workspace",
            },
          ],
        },
      ],
    });

  const groupedRetrievalDatasourceConfigurations = _.groupBy(
    retrievalDatasourceConfigurations,
    "retrievalConfigurationId"
  );

  const groupedAgentRetrievalConfigurations = groupByAgentConfigurationId(
    retrievalConfigurationIds
  );

  const actionsByConfigurationId: Map<ModelId, AgentActionConfigurationType[]> =
    new Map();
  for (const [agentConfigurationId, retrievalConfiguration] of Object.entries(
    groupedAgentRetrievalConfigurations
  )) {
    const actions: AgentActionConfigurationType[] = [];
    for (const retrievalConfig of retrievalConfiguration) {
      const dataSourceConfig =
        groupedRetrievalDatasourceConfigurations[retrievalConfig.id] ?? [];

      let topK: number | "auto" = "auto";
      if (retrievalConfig.topKMode === "custom") {
        if (!retrievalConfig.topK) {
          // unreachable
          throw new Error(
            `Couldn't find topK for retrieval configuration ${retrievalConfig.id}} with 'custom' topK mode`
          );
        }

        topK = retrievalConfig.topK;
      }

      actions.push({
        id: retrievalConfig.id,
        sId: retrievalConfig.sId,
        type: "retrieval_configuration",
        query: retrievalConfig.query,
        relativeTimeFrame: renderRetrievalTimeframeType(retrievalConfig),
        topK,
        dataSources: dataSourceConfig.map(getDataSource),
        name: retrievalConfig.name || DEFAULT_RETRIEVAL_ACTION_NAME,
        description: retrievalConfig.description,
      });
    }

    actionsByConfigurationId.set(parseInt(agentConfigurationId, 10), actions);
  }

  return actionsByConfigurationId;
}

function getDataSource(dataSourceConfig: AgentDataSourceConfiguration) {
  const { dataSourceView, dataSource } = dataSourceConfig;

  if (dataSourceView) {
    return {
      dataSourceId: DataSourceViewResource.modelIdToSId({
        id: dataSourceView.id,
        workspaceId: dataSourceView.workspaceId,
      }),
      workspaceId: dataSourceView.workspace.sId,
      filter: {
        parents:
          dataSourceConfig.parentsIn && dataSourceConfig.parentsNotIn
            ? {
                in: dataSourceConfig.parentsIn,
                not: dataSourceConfig.parentsNotIn,
              }
            : null,
      },
    };
  }

  return {
    dataSourceId: dataSource.name,
    workspaceId: dataSource.workspace.sId,
    filter: {
      parents:
        dataSourceConfig.parentsIn && dataSourceConfig.parentsNotIn
          ? {
              in: dataSourceConfig.parentsIn,
              not: dataSourceConfig.parentsNotIn,
            }
          : null,
    },
  };
}
