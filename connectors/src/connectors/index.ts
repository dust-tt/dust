import {
  cleanupGithubConnector,
  createGithubConnector,
  fullResyncGithubConnector,
  resumeGithubConnector,
  retrieveGithubConnectorPermissions,
  retrieveGithubReposTitles,
  stopGithubConnector,
  updateGithubConnector,
} from "@connectors/connectors/github";
import {
  cleanupGoogleDriveConnector,
  createGoogleDriveConnector,
  getGoogleDriveConfig,
  retrieveGoogleDriveConnectorPermissions,
  retrieveGoogleDriveObjectsParents,
  retrieveGoogleDriveObjectsTitles,
  setGoogleDriveConfig,
  setGoogleDriveConnectorPermissions,
  updateGoogleDriveConnector,
} from "@connectors/connectors/google_drive";
import { launchGoogleDriveFullSyncWorkflow } from "@connectors/connectors/google_drive/temporal/client";
import {
  BotEnabledGetter,
  BotToggler,
  ConnectorBatchResourceTitleRetriever,
  ConnectorCleaner,
  ConnectorConfigGetter,
  ConnectorConfigSetter,
  ConnectorCreator,
  ConnectorPermissionRetriever,
  ConnectorPermissionSetter,
  ConnectorResourceParentsRetriever,
  ConnectorResumer,
  ConnectorStopper,
  ConnectorUpdater,
  SyncConnector,
} from "@connectors/connectors/interface";
import {
  cleanupNotionConnector,
  createNotionConnector,
  fullResyncNotionConnector,
  resumeNotionConnector,
  retrieveNotionConnectorPermissions,
  retrieveNotionResourceParents,
  retrieveNotionResourcesTitles,
  stopNotionConnector,
  updateNotionConnector,
} from "@connectors/connectors/notion";
import {
  cleanupSlackConnector,
  createSlackConnector,
  retrieveSlackChannelsTitles,
  retrieveSlackConnectorPermissions,
  setSlackConnectorPermissions,
  updateSlackConnector,
} from "@connectors/connectors/slack";
import {
  getBotEnabled,
  toggleSlackbot,
} from "@connectors/connectors/slack/bot";
import { launchSlackSyncWorkflow } from "@connectors/connectors/slack/temporal/client";
import { ModelId } from "@connectors/lib/models";
import { Err, Ok, Result } from "@connectors/lib/result";
import logger from "@connectors/logger/logger";
import { ConnectorProvider } from "@connectors/types/connector";

export const CREATE_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorCreator
> = {
  slack: createSlackConnector,
  notion: createNotionConnector,
  github: createGithubConnector,
  google_drive: createGoogleDriveConnector,
};

export const UPDATE_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorUpdater
> = {
  slack: updateSlackConnector,
  notion: updateNotionConnector,
  github: updateGithubConnector,
  google_drive: updateGoogleDriveConnector,
};

export const STOP_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorStopper
> = {
  slack: async (connectorId: string) => {
    logger.info({ connectorId }, `Stopping Slack connector is a no-op.`);
    return new Ok(connectorId);
  },
  github: stopGithubConnector,
  notion: stopNotionConnector,
  google_drive: async (connectorId: string) => {
    logger.info({ connectorId }, `Stopping Google Drive connector is a no-op.`);
    return new Ok(connectorId);
  },
};

export const DELETE_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorCleaner
> = {
  slack: cleanupSlackConnector,
  notion: cleanupNotionConnector,
  github: cleanupGithubConnector,
  google_drive: cleanupGoogleDriveConnector,
};

export const RESUME_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorResumer
> = {
  slack: async (connectorId: string) => {
    logger.info({ connectorId }, `Resuming Slack connector is a no-op.`);
    return new Ok(connectorId);
  },
  notion: resumeNotionConnector,
  github: resumeGithubConnector,
  google_drive: async (connectorId: string) => {
    throw new Error(`Not implemented ${connectorId}`);
  },
};

const toggleBotNotImplemented = async (
  connectorId: ModelId
): Promise<Result<void, Error>> => {
  return new Err(
    new Error(`Toggling bot for connector ${connectorId} is not implemented.`)
  );
};

export const TOGGLE_BOT_BY_TYPE: Record<ConnectorProvider, BotToggler> = {
  slack: toggleSlackbot,
  notion: toggleBotNotImplemented,
  github: toggleBotNotImplemented,
  google_drive: toggleBotNotImplemented,
};

const getBotEnabledNotImplemented = async (
  connectorId: ModelId
): Promise<Result<boolean, Error>> => {
  return new Err(
    new Error(
      `Getting botEnabled for connector ${connectorId} is not implemented.`
    )
  );
};

export const GET_BOT_ENABLED_BY_TYPE: Record<
  ConnectorProvider,
  BotEnabledGetter
> = {
  slack: getBotEnabled,
  notion: getBotEnabledNotImplemented,
  github: getBotEnabledNotImplemented,
  google_drive: getBotEnabledNotImplemented,
};

export const SYNC_CONNECTOR_BY_TYPE: Record<ConnectorProvider, SyncConnector> =
  {
    slack: launchSlackSyncWorkflow,
    notion: fullResyncNotionConnector,
    github: fullResyncGithubConnector,
    google_drive: launchGoogleDriveFullSyncWorkflow,
  };

export const RETRIEVE_CONNECTOR_PERMISSIONS_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorPermissionRetriever
> = {
  slack: retrieveSlackConnectorPermissions,
  github: retrieveGithubConnectorPermissions,
  notion: retrieveNotionConnectorPermissions,
  google_drive: retrieveGoogleDriveConnectorPermissions,
};

export const SET_CONNECTOR_PERMISSIONS_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorPermissionSetter
> = {
  slack: setSlackConnectorPermissions,
  notion: async () => {
    return new Err(
      new Error(`Setting Notion connector permissions is not implemented yet.`)
    );
  },
  github: async () => {
    return new Err(
      new Error(`Setting Github connector permissions is not implemented yet.`)
    );
  },
  google_drive: setGoogleDriveConnectorPermissions,
};

export const BATCH_RETRIEVE_RESOURCE_TITLE_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorBatchResourceTitleRetriever
> = {
  slack: retrieveSlackChannelsTitles,
  notion: retrieveNotionResourcesTitles,
  github: retrieveGithubReposTitles,
  google_drive: retrieveGoogleDriveObjectsTitles,
};

export const RETRIEVE_RESOURCE_PARENTS_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorResourceParentsRetriever
> = {
  notion: retrieveNotionResourceParents,
  google_drive: retrieveGoogleDriveObjectsParents,
  slack: async () => new Ok([]), // Slack is flat
  github: async () => new Ok([]), // Github is flat,
};

export const SET_CONNECTOR_CONFIG_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorConfigSetter
> = {
  slack: () => {
    throw new Error("Not implemented");
  },
  notion: async () => {
    throw new Error("Not implemented");
  },
  github: async () => {
    throw new Error("Not implemented");
  },
  google_drive: setGoogleDriveConfig,
};

export const GET_CONNECTOR_CONFIG_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorConfigGetter
> = {
  slack: () => {
    throw new Error("Not implemented");
  },
  notion: async () => {
    throw new Error("Not implemented");
  },
  github: async () => {
    throw new Error("Not implemented");
  },
  google_drive: getGoogleDriveConfig,
};
