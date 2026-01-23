import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig, DataSourceInfo } from "@connectors/types";

export function dataSourceConfigFromConnector(
  connector: ConnectorResource
): DataSourceConfig {
  return {
    workspaceAPIKey: connector.workspaceAPIKey,
    dataSourceId: connector.dataSourceId,
    workspaceId: connector.workspaceId,
  };
}

export function dataSourceInfoFromConnector(
  connector: ConnectorResource
): DataSourceInfo {
  return {
    dataSourceId: connector.dataSourceId,
    workspaceId: connector.workspaceId,
  };
}
