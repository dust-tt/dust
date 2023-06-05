import { Transaction } from "sequelize";

import {
  cleanupNotionConnector,
  createNotionConnector,
  fullResyncNotionConnector,
  resumeNotionConnector,
  stopNotionConnector,
} from "@connectors/connectors/notion";
import { cleanupSlackConnector } from "@connectors/connectors/slack";
import { createSlackConnector } from "@connectors/connectors/slack";
import { launchSlackSyncWorkflow } from "@connectors/connectors/slack/temporal/client";
import { Ok, Result } from "@connectors/lib/result";
import logger from "@connectors/logger/logger";
import { ConnectorProvider } from "@connectors/types/connector";
import { DataSourceConfig } from "@connectors/types/data_source_config";

type ConnectorCreator = (
  dataSourceConfig: DataSourceConfig,
  connectionId: string
) => Promise<Result<string, Error>>;

export const CREATE_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorCreator
> = {
  slack: createSlackConnector,
  notion: createNotionConnector,
};

type ConnectorStopper = (connectorId: string) => Promise<Result<string, Error>>;

export const STOP_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorStopper
> = {
  slack: async (connectorId: string) => {
    logger.info(
      `Stopping Slack connector is a no-op. ConnectorId: ${connectorId}`
    );
    return new Ok(connectorId);
  },
  notion: stopNotionConnector,
};

// Should cleanup any state/resources associated with the connector
type ConnectorCleaner = (
  connectorId: string,
  transaction: Transaction
) => Promise<Result<void, Error>>;

export const CLEAN_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorCleaner
> = {
  slack: cleanupSlackConnector,
  notion: cleanupNotionConnector,
};

type ConnectorResumer = (connectorId: string) => Promise<Result<string, Error>>;

export const RESUME_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorResumer
> = {
  slack: async (connectorId: string) => {
    logger.info(
      `Resuming Slack connector is a no-op. ConnectorId: ${connectorId}`
    );
    return new Ok(connectorId);
  },
  notion: resumeNotionConnector,
};

type SyncConnector = (connectorId: string) => Promise<Result<string, Error>>;

export const SYNC_CONNECTOR_BY_TYPE: Record<ConnectorProvider, SyncConnector> =
  {
    slack: launchSlackSyncWorkflow,
    notion: fullResyncNotionConnector,
  };
