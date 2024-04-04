import type {
  ConnectorConfigurations,
  ConnectorPermission,
  ConnectorProvider,
  ConnectorsAPIError,
  ContentNode,
  ContentNodesViewType,
  ModelId,
  Result,
} from "@dust-tt/types";
import type { ConnectorConfiguration } from "@dust-tt/types";

import type { DataSourceConfig } from "@connectors/types/data_source_config";

export type ConnectorCreate<T extends ConnectorConfiguration> = (
  DataSourceConfig: DataSourceConfig,
  connectionid: string,
  configuration: T
) => Promise<Result<string, Error>>;

export type ConnectorProviderCreateConnectorMapping = {
  [K in ConnectorProvider]: ConnectorCreate<ConnectorConfigurations[K]>;
};

export type ConnectorUpdater = (
  connectorId: ModelId,
  params: {
    connectionId?: string | null;
  }
) => Promise<Result<string, ConnectorsAPIError>>;

export type ConnectorStopper = (
  connectorId: ModelId
) => Promise<Result<undefined, Error>>;

// Should cleanup any state/resources associated with the connector
export type ConnectorCleaner = (
  connectorId: ModelId,
  force: boolean
) => Promise<Result<undefined, Error>>;

export type ConnectorResumer = (
  connectorId: ModelId
) => Promise<Result<undefined, Error>>;

export type SyncConnector = (
  connectorId: ModelId,
  fromTs: number | null
) => Promise<Result<string, Error>>;

export type ConnectorPermissionRetriever = (params: {
  connectorId: ModelId;
  parentInternalId: string | null;
  filterPermission: ConnectorPermission | null;
  viewType: ContentNodesViewType;
}) => Promise<Result<ContentNode[], Error>>;

export type ConnectorPermissionSetter = (
  connectorId: ModelId,
  // internalId -> "read" | "write" | "read_write" | "none"
  permissions: Record<string, ConnectorPermission>
) => Promise<Result<void, Error>>;

export type ConnectorBatchContentNodesRetriever = (
  connectorId: ModelId,
  internalIds: string[],
  viewType: ContentNodesViewType
) => Promise<Result<ContentNode[], Error>>;

export type ContentNodeParentsRetriever = (
  connectorId: ModelId,
  internalId: string,
  memoizationKey?: string
) => Promise<Result<string[], Error>>;

export type ConnectorConfigSetter = (
  connectorId: ModelId,
  configKey: string,
  configValue: string
) => Promise<Result<void, Error>>;

export type ConnectorConfigGetter = (
  connectorId: ModelId,
  configKey: string
) => Promise<Result<string, Error>>;

export type ConnectorGarbageCollector = (
  connectorId: ModelId
) => Promise<Result<string, Error>>;

export type ConnectorPauser = (
  connectorId: ModelId
) => Promise<Result<undefined, Error>>;
export type ConnectorConfigurationSetter<T extends ConnectorConfiguration> = (
  connectorId: ModelId,
  configuration: T
) => Promise<Result<void, Error>>;

export type ConnectorProviderUpdateConfigurationMapping = {
  [K in keyof ConnectorConfigurations]: ConnectorConfigurationSetter<
    ConnectorConfigurations[K]
  >;
};
