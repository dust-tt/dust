import _ from "lodash";
import { Op } from "sequelize";

import { renderRetrievalTimeframeType } from "@app/lib/actions/configuration/helpers";
import { getDataSource } from "@app/lib/actions/configuration/retrieval";
import { DEFAULT_PROCESS_ACTION_NAME } from "@app/lib/actions/constants";
import type { ProcessConfigurationType } from "@app/lib/actions/types/process";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { AgentProcessConfiguration } from "@app/lib/models/assistant/actions/process";
import { Workspace } from "@app/lib/models/workspace";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import type { ModelId } from "@app/types";

export async function fetchAgentProcessActionConfigurations({
  configurationIds,
  variant,
}: {
  configurationIds: ModelId[];
  variant: "light" | "full";
}): Promise<Map<ModelId, ProcessConfigurationType[]>> {
  if (variant !== "full") {
    return new Map();
  }

  // Find the process configurations for the given agent configurations.
  const processConfiguration = await AgentProcessConfiguration.findAll({
    where: { agentConfigurationId: { [Op.in]: configurationIds } },
  });

  if (processConfiguration.length === 0) {
    return new Map();
  }

  // Find the associated data sources configurations.
  const processDatasourceConfigurations =
    await AgentDataSourceConfiguration.findAll({
      where: {
        processConfigurationId: {
          [Op.in]: processConfiguration.map((r) => r.id),
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

  const groupedProcessDatasourceConfigurations = _.groupBy(
    processDatasourceConfigurations,
    "processConfigurationId"
  );

  const groupedAgentProcessConfigurations = _.groupBy(
    processConfiguration,
    "agentConfigurationId"
  );

  const actionsByConfigurationId: Map<ModelId, ProcessConfigurationType[]> =
    new Map();
  for (const [agentConfigurationId, processConfiguration] of Object.entries(
    groupedAgentProcessConfigurations
  )) {
    const actions: ProcessConfigurationType[] = [];
    for (const processConfig of processConfiguration) {
      const dataSourceConfig =
        groupedProcessDatasourceConfigurations[processConfig.id] ?? [];

      actions.push({
        id: processConfig.id,
        sId: processConfig.sId,
        type: "process_configuration",
        dataSources: dataSourceConfig.map(getDataSource),
        relativeTimeFrame: renderRetrievalTimeframeType(processConfig),
        schema: processConfig.schema,
        name: processConfig.name || DEFAULT_PROCESS_ACTION_NAME,
        description: processConfig.description,
      });
    }

    actionsByConfigurationId.set(parseInt(agentConfigurationId, 10), actions);
  }

  return actionsByConfigurationId;
}
