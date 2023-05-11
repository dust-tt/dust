import { Connector } from "@connectors/lib/models";
import { DataSourceConfig } from "@connectors/types/data_source_config";

export function dataSourceConfigFromConnector(
  connector: Connector
): DataSourceConfig {
  return {
    workspaceAPIKey: connector.workspaceAPIKey,
    dataSourceName: connector.dataSourceName,
    workspaceId: connector.workspaceId,
  };
}
