import type { ConnectorResource } from "@connectors/resources/connector_res";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

export function dataSourceConfigFromConnector(
  connector: ConnectorResource
): DataSourceConfig {
  return {
    workspaceAPIKey: connector.workspaceAPIKey,
    dataSourceName: connector.dataSourceName,
    workspaceId: connector.workspaceId,
  };
}
