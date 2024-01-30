import { getDbConnection } from "@connectors/resources/db";
import {
  connectors,
  githubConnectorStates,
} from "@connectors/resources/db/schema";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const db = getDbConnection();

export async function createGithubConnector(
  installationId: string,
  dataSourceConfig: DataSourceConfig
) {
  const connector = await db.transaction(async (tx) => {
    const connector = tx
      .insert(connectors)
      .values({
        type: "github",
        connectionId: installationId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceName: dataSourceConfig.dataSourceName,
      })
      .returning();
    tx.insert(githubConnectorStates).values({
      connectorId: connector.id,
      webhooksEnabledAt: new Date(),
      codeSyncEnabled: false,
    });

    return connector;
  });

  return connector;
}
