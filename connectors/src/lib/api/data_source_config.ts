import type { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

export function dataSourceConfigFromConnector(
  connector: ConnectorModel
): DataSourceConfig {
  return {
    workspaceAPIKey: connector.workspaceAPIKey,
    dataSourceName: connector.dataSourceName,
    workspaceId: connector.workspaceId,
  };
}
