import type { ConnectorProvider } from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { DataSource } from "@app/lib/models/data_source";
import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";

export type AgentEnabledDataSource = {
  dataSourceId: number;
};

export async function getAgentEnabledDataSources({
  auth,
  providerFilter,
}: {
  auth: Authenticator;
  providerFilter: ConnectorProvider | null;
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

  const dataSourceConfigurations = await AgentDataSourceConfiguration.findAll({
    include: [
      {
        model: DataSource,
        as: "dataSource",
        where: {
          workspaceId: wId,
          connectorProvider: providerFilter,
        },
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
    dataSourceId: dsConfig.dataSource.id,
  }));
}
