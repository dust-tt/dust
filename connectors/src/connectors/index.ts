import { Transaction } from "sequelize";

import {
  cleanupGithubConnector,
  createGithubConnector,
  fullResyncGithubConnector,
  resumeGithubConnector,
  stopGithubConnector,
} from "@connectors/connectors/github";
import {
  cleanupGoogleDriveConnector,
  createGoogleDriveConnector,
} from "@connectors/connectors/google_drive";
import { launchGoogleDriveFullSyncWorkflow } from "@connectors/connectors/google_drive/temporal/client";
import {
  cleanupNotionConnector,
  createNotionConnector,
  fullResyncNotionConnector,
  resumeNotionConnector,
  stopNotionConnector,
} from "@connectors/connectors/notion";
import {
  cleanupSlackConnector,
  createSlackConnector,
} from "@connectors/connectors/slack";
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
  github: createGithubConnector,
  google_drive: createGoogleDriveConnector,
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
  github: stopGithubConnector,
  notion: stopNotionConnector,
  google_drive: async (connectorId: string) => {
    logger.info(
      `Stopping Google Drive connector is a no-op. ConnectorId: ${connectorId}`
    );
    return new Ok(connectorId);
  },
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
  github: cleanupGithubConnector,
  google_drive: cleanupGoogleDriveConnector,
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
  github: resumeGithubConnector,
  google_drive: async (connectorId: string) => {
    throw new Error(`Not implemented ${connectorId}`);
  },
};

type SyncConnector = (connectorId: string) => Promise<Result<string, Error>>;

export const SYNC_CONNECTOR_BY_TYPE: Record<ConnectorProvider, SyncConnector> =
  {
    slack: launchSlackSyncWorkflow,
    notion: fullResyncNotionConnector,
    github: fullResyncGithubConnector,
    google_drive: launchGoogleDriveFullSyncWorkflow,
  };
