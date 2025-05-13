import _ from "lodash";
import { Op } from "sequelize";

import {
  renderDataSourceConfiguration,
  renderRetrievalTimeframeType,
} from "@app/lib/actions/configuration/helpers";
import { DEFAULT_RETRIEVAL_ACTION_NAME } from "@app/lib/actions/constants";
import type { RetrievalConfigurationType } from "@app/lib/actions/retrieval";
import type { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { AgentRetrievalConfiguration } from "@app/lib/models/assistant/actions/retrieval";
import { Workspace } from "@app/lib/models/workspace";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import type { AgentFetchVariant, ModelId } from "@app/types";

export async function fetchAgentRetrievalActionConfigurations(
  auth: Authenticator,
  {
    configurationIds,
    variant,
  }: {
    configurationIds: ModelId[];
    variant: AgentFetchVariant;
  }
): Promise<Map<ModelId, RetrievalConfigurationType[]>> {
  if (variant !== "full") {
    return new Map();
  }

  // Find the retrieval configurations for the given agent configurations.
  const retrievalConfigurations = await AgentRetrievalConfiguration.findAll({
    where: {
      agentConfigurationId: { [Op.in]: configurationIds },
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });

  if (retrievalConfigurations.length === 0) {
    return new Map();
  }

  // Find the associated data sources configurations.
  const retrievalDatasourceConfigurations =
    await AgentDataSourceConfiguration.findAll({
      where: {
        retrievalConfigurationId: {
          [Op.in]: retrievalConfigurations.map((r) => r.id),
        },
      },
      include: [
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

  const groupedAgentRetrievalConfigurations = _.groupBy(
    retrievalConfigurations,
    "agentConfigurationId"
  );

  const actionsByConfigurationId: Map<ModelId, RetrievalConfigurationType[]> =
    new Map();
  for (const [agentConfigurationId, retrievalConfiguration] of Object.entries(
    groupedAgentRetrievalConfigurations
  )) {
    const actions: RetrievalConfigurationType[] = [];
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
        dataSources: dataSourceConfig.map(renderDataSourceConfiguration),
        name: retrievalConfig.name || DEFAULT_RETRIEVAL_ACTION_NAME,
        description: retrievalConfig.description,
      });
    }

    actionsByConfigurationId.set(parseInt(agentConfigurationId, 10), actions);
  }

  return actionsByConfigurationId;
}
