import type { ConnectorProvider } from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { DataSource } from "@app/lib/models/data_source";
import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";

export type AgentEnabledDataSource = {
  workspaceId: number;
  dataSourceId: number;
  dataSourceName: string;
  dataSourceDescription: string | null;
  connectorProvider: ConnectorProvider | null;
  connectorId: string | null;
  createdAt: number;
  createdBy: string;
};

export async function getAgentEnabledDataSources({
  auth,
  providerFilter,
}: {
  auth: Authenticator;
  providerFilter?: ConnectorProvider;
}): Promise<AgentEnabledDataSource[]> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return [];
  }
  const workspace = await Workspace.findOne({
    where: { sId: owner.sId },
  });
  if (!workspace) {
    throw new Error(`Workspace not found for sId: ${owner.sId}`);
  }
  const wId = workspace.id;

  const filters = providerFilter
    ? {
        workspaceId: wId,
        connectorProvider: providerFilter,
      }
    : { workspaceId: wId };

  const dataSourceConfigurations = await AgentDataSourceConfiguration.findAll({
    include: [
      {
        model: DataSource,
        as: "dataSource",
        where: filters,
        include: [
          {
            model: User,
            as: "editedByUser",
          },
        ],
      },
    ],
  });
  return dataSourceConfigurations.map((dsConfig) => ({
    workspaceId: wId,
    dataSourceId: dsConfig.dataSource.id,
    dataSourceName: dsConfig.dataSource.name,
    connectorProvider: dsConfig.dataSource.connectorProvider,
    connectorId: dsConfig.dataSource.connectorId,
    createdAt: dsConfig.createdAt.getTime(),
    createdBy: dsConfig.dataSource.editedByUser.name,
    dataSourceDescription: dsConfig.dataSource.description,
  }));
}
