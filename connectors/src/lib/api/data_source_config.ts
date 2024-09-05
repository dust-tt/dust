import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type {
  DataSourceConfig,
  DataSourceInfo,
} from "@connectors/types/data_source_config";

export function dataSourceConfigFromConnector(
  // TODO(2024-02-14 flav) Remove ConnectorModel once fully bundled in `ConnectorResource`.
  connector: ConnectorResource | ConnectorModel
): DataSourceConfig {
  return {
    workspaceAPIKey: connector.workspaceAPIKey,
    dataSourceId: connector.dataSourceId,
    workspaceId: connector.workspaceId,
  };
}

export function dataSourceInfoFromConnector(
  // TODO(2024-02-14 flav) Remove ConnectorModel once fully bundled in `ConnectorResource`.
  connector: ConnectorResource | ConnectorModel
): DataSourceInfo {
  return {
    dataSourceId: connector.dataSourceId,
    workspaceId: connector.workspaceId,
  };
}
