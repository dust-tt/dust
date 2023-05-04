import {
  cleanupNotionConnector,
  createNotionConnector,
  fullResyncNotionConnector,
  resumeNotionConnector,
  stopNotionConnector,
} from "@connectors/connectors/notion";
import { createSlackConnector } from "@connectors/connectors/slack";
import { launchSlackSyncWorkflow } from "@connectors/connectors/slack/temporal/client";
import { Ok, Result } from "@connectors/lib/result";
import { ConnectorProvider } from "@connectors/types/connector";
import {
  DataSourceConfig,
  DataSourceInfo,
} from "@connectors/types/data_source_config";

type ConnectorCreator = (
  dataSourceConfig: DataSourceConfig,
  nangoConnectionId: string
) => Promise<Result<string, Error>>;

export const CREATE_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorCreator
> = {
  slack: createSlackConnector,
  notion: createNotionConnector,
};

type ConnectorStopper = (
  dataSourceInfo: DataSourceInfo
) => Promise<Result<string, Error>>;

export const STOP_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorStopper
> = {
  slack: async () => {
    throw new Error("Not implemented");
  },
  notion: stopNotionConnector,
};

// Should cleanup any state/resources associated with the connector
type ConnectorCleaner = (connectorId: string) => Promise<Result<void, Error>>;
export const CLEAN_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorCleaner
> = {
  slack: async () => {
    // no-op
    return new Ok(undefined);
  },
  notion: cleanupNotionConnector,
};

type ConnectorResumer = (
  dataSourceConfig: DataSourceConfig,
  nangoConnectionId: string
) => Promise<Result<string, Error>>;

export const RESUME_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorResumer
> = {
  slack: async () => {
    throw new Error("Not implemented");
  },
  notion: resumeNotionConnector,
};

type SyncConnector = (connectorId: string) => Promise<Result<string, Error>>;

export const SYNC_CONNECTOR_BY_TYPE: Record<ConnectorProvider, SyncConnector> =
  {
    slack: launchSlackSyncWorkflow,
    notion: fullResyncNotionConnector,
  };
