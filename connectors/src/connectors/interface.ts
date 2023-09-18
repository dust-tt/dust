import { Transaction } from "sequelize";

import { ModelId } from "@connectors/lib/models";
import { Result } from "@connectors/lib/result";
import { DataSourceConfig } from "@connectors/types/data_source_config";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";
import {
  ConnectorPermission,
  ConnectorResource,
} from "@connectors/types/resources";

export type ConnectorCreator = (
  dataSourceConfig: DataSourceConfig,
  connectionId: string
) => Promise<Result<string, Error>>;

export type ConnectorUpdater = (
  connectorId: ModelId,
  params: {
    connectionId?: string | null;
    defaultNewResourcePermission?: ConnectorPermission | null;
  }
) => Promise<Result<string, ConnectorsAPIErrorResponse>>;

export type ConnectorStopper = (
  connectorId: string
) => Promise<Result<string, Error>>;

// Should cleanup any state/resources associated with the connector
export type ConnectorCleaner = (
  connectorId: string,
  transaction: Transaction,
  force: boolean
) => Promise<Result<void, Error>>;

export type ConnectorResumer = (
  connectorId: string
) => Promise<Result<string, Error>>;

export type BotToggler = (
  connectorId: ModelId,
  botEnabled: boolean
) => Promise<Result<void, Error>>;

export type BotEnabledGetter = (
  connectorId: ModelId
) => Promise<Result<boolean, Error>>;

export type SyncConnector = (
  connectorId: string,
  fromTs: number | null
) => Promise<Result<string, Error>>;

export type ConnectorPermissionRetriever = (params: {
  connectorId: ModelId;
  parentInternalId: string | null;
  filterPermission: ConnectorPermission | null;
}) => Promise<Result<ConnectorResource[], Error>>;

export type ConnectorPermissionSetter = (
  connectorId: ModelId,
  // internalId -> "read" | "write" | "read_write" | "none"
  permissions: Record<string, ConnectorPermission>
) => Promise<Result<void, Error>>;
