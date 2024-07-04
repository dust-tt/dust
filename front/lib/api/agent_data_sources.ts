import type { ConnectorProvider, ModelId } from "@dust-tt/types";
import { Sequelize } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { DataSource } from "@app/lib/models/data_source";

export type DataSourcesUsageByAgent = Record<ModelId, number>;

export async function getDataSourcesUsageByAgents({
  auth,
  providerFilter,
}: {
  auth: Authenticator;
  providerFilter: ConnectorProvider | null;
}): Promise<DataSourcesUsageByAgent> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return {};
  }

  const agentDataSourceConfigurations =
    await AgentDataSourceConfiguration.findAll({
      attributes: [
        [Sequelize.col("dataSource.id"), "dataSourceId"],
        [Sequelize.fn("COUNT", Sequelize.col("dataSource.id")), "count"],
      ],
      include: [
        {
          model: DataSource,
          as: "dataSource",
          where: {
            workspaceId: owner.id,
            connectorProvider: providerFilter,
          },
        },
      ],
      group: ["dataSource.id"],
      raw: true,
    });
  return agentDataSourceConfigurations.reduce<DataSourcesUsageByAgent>(
    (acc, dsConfig) => {
      acc[dsConfig.dataSourceId] = (
        dsConfig as unknown as { count: number }
      ).count;
      return acc;
    },
    {}
  );
}
