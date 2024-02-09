import type {
  ConnectorNode,
  ConnectorPermission,
  ConnectorsAPIError,
  CreateConnectorUrlRequestBody,
  ModelId,
} from "@dust-tt/types";

import type { Result } from "@connectors/lib/result";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

export type ConnectorCreatorOAuth = (
  dataSourceConfig: DataSourceConfig,
  connectionId: string
) => Promise<Result<string, Error>>;

export type ConnectorCreatorUrl = (
  dataSourceConfig: DataSourceConfig,
  urlConfig: CreateConnectorUrlRequestBody
) => Promise<Result<string, Error>>;

export type ConnectorUpdaterOAuth = (
  connectorId: ModelId,
  params: {
    connectionId?: string | null;
  }
) => Promise<Result<string, ConnectorsAPIError>>;

export type ConnectorUpdaterUrl = (
  connectorId: ModelId,
  urlConfig: CreateConnectorUrlRequestBody
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
}) => Promise<Result<ConnectorNode[], Error>>;

export type ConnectorPermissionSetter = (
  connectorId: ModelId,
  // internalId -> "read" | "write" | "read_write" | "none"
  permissions: Record<string, ConnectorPermission>
) => Promise<Result<void, Error>>;

export type ConnectorBatchResourceTitleRetriever = (
  connectorId: ModelId,
  internalIds: string[]
) => Promise<Result<Record<string, string | null>, Error>>;

export type ConnectorNodeParentsRetriever = (
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
