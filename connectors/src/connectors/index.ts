import type { ConnectorProvider, ModelId } from "@dust-tt/types";

import {
  cleanupConfluenceConnector,
  createConfluenceConnector,
  resumeConfluenceConnector,
  retrieveConfluenceConnectorPermissions,
  retrieveConfluenceContentNodeParents,
  retrieveConfluenceContentNodes,
  retrieveConfluenceObjectsTitles,
  setConfluenceConnectorPermissions,
  stopConfluenceConnector,
  updateConfluenceConnector,
} from "@connectors/connectors/confluence";
import { launchConfluenceSyncWorkflow } from "@connectors/connectors/confluence/temporal/client";
import {
  cleanupGithubConnector,
  createGithubConnector,
  fullResyncGithubConnector,
  getGithubConfig,
  resumeGithubConnector,
  retrieveGithubConnectorPermissions,
  retrieveGithubContentNodeParents,
  retrieveGithubReposContentNodes,
  retrieveGithubReposTitles,
  setGithubConfig,
  stopGithubConnector,
  updateGithubConnector,
} from "@connectors/connectors/github";
import {
  cleanupGoogleDriveConnector,
  createGoogleDriveConnector,
  getGoogleDriveConfig,
  googleDriveGarbageCollect,
  retrieveGoogleDriveConnectorPermissions,
  retrieveGoogleDriveContentNodeParents,
  retrieveGoogleDriveContentNodes,
  retrieveGoogleDriveObjectsTitles,
  setGoogleDriveConfig,
  setGoogleDriveConnectorPermissions,
  updateGoogleDriveConnector,
} from "@connectors/connectors/google_drive";
import { launchGoogleDriveFullSyncWorkflow } from "@connectors/connectors/google_drive/temporal/client";
import {
  cleanupIntercomConnector,
  createIntercomConnector,
  fullResyncIntercomSyncWorkflow,
  resumeIntercomConnector,
  retrieveIntercomConnectorPermissions,
  retrieveIntercomContentNodeParents,
  retrieveIntercomContentNodes,
  retrieveIntercomNodesTitles,
  setIntercomConnectorPermissions,
  stopIntercomConnector,
  updateIntercomConnector,
} from "@connectors/connectors/intercom";
import type {
  ConnectorBatchContentNodesRetriever,
  ConnectorBatchResourceTitleRetriever,
  ConnectorCleaner,
  ConnectorConfigGetter,
  ConnectorConfigSetter,
  ConnectorCreatorOAuth,
  ConnectorCreatorUrl,
  ConnectorGarbageCollector,
  ConnectorNodeParentsRetriever,
  ConnectorPermissionRetriever,
  ConnectorPermissionSetter,
  ConnectorResumer,
  ConnectorStopper,
  ConnectorUpdaterOAuth,
  ConnectorUpdaterUrl,
  SyncConnector,
} from "@connectors/connectors/interface";
import {
  cleanupNotionConnector,
  createNotionConnector,
  fullResyncNotionConnector,
  resumeNotionConnector,
  retrieveNotionConnectorPermissions,
  retrieveNotionContentNodeParents,
  retrieveNotionContentNodes,
  retrieveNotionNodesTitles,
  stopNotionConnector,
  updateNotionConnector,
} from "@connectors/connectors/notion";
import {
  cleanupSlackConnector,
  createSlackConnector,
  getSlackConfig,
  retrieveSlackChannelsTitles,
  retrieveSlackConnectorPermissions,
  retrieveSlackContentNodes,
  setSlackConfig,
  setSlackConnectorPermissions,
  updateSlackConnector,
} from "@connectors/connectors/slack";
import { launchSlackSyncWorkflow } from "@connectors/connectors/slack/temporal/client";
import { Err, Ok } from "@connectors/lib/result";
import logger from "@connectors/logger/logger";

import {
  cleanupWebcrawlerConnector,
  createWebcrawlerConnector,
  retrieveWebcrawlerConnectorPermissions,
  retrieveWebCrawlerContentNodeParents,
  retrieveWebCrawlerContentNodes,
  retrieveWebCrawlerObjectsTitles,
  stopWebcrawlerConnector,
  updateWebcrawlerConnector,
} from "./webcrawler";
import { launchCrawlWebsiteWorkflow } from "./webcrawler/temporal/client";

export const CREATE_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorCreatorOAuth | ConnectorCreatorUrl
> = {
  confluence: createConfluenceConnector,
  github: createGithubConnector,
  google_drive: createGoogleDriveConnector,
  intercom: createIntercomConnector,
  notion: createNotionConnector,
  slack: createSlackConnector,
  webcrawler: createWebcrawlerConnector,
};

export const UPDATE_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorUpdaterOAuth | ConnectorUpdaterUrl
> = {
  confluence: updateConfluenceConnector,
  slack: updateSlackConnector,
  notion: updateNotionConnector,
  github: updateGithubConnector,
  google_drive: updateGoogleDriveConnector,
  intercom: updateIntercomConnector,
  webcrawler: updateWebcrawlerConnector,
};

export const STOP_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorStopper
> = {
  confluence: stopConfluenceConnector,
  slack: async (connectorId: ModelId) => {
    logger.info({ connectorId }, `Stopping Slack connector is a no-op.`);
    return new Ok(undefined);
  },
  github: stopGithubConnector,
  notion: stopNotionConnector,
  google_drive: async (connectorId: ModelId) => {
    logger.info({ connectorId }, `Stopping Google Drive connector is a no-op.`);
    return new Ok(undefined);
  },
  intercom: stopIntercomConnector,
  webcrawler: stopWebcrawlerConnector,
};

export const DELETE_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorCleaner
> = {
  confluence: cleanupConfluenceConnector,
  slack: cleanupSlackConnector,
  notion: cleanupNotionConnector,
  github: cleanupGithubConnector,
  google_drive: cleanupGoogleDriveConnector,
  intercom: cleanupIntercomConnector,
  webcrawler: cleanupWebcrawlerConnector,
};

export const RESUME_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorResumer
> = {
  confluence: resumeConfluenceConnector,
  slack: async (connectorId: ModelId) => {
    logger.info({ connectorId }, `Resuming Slack connector is a no-op.`);
    return new Ok(undefined);
  },
  notion: resumeNotionConnector,
  github: resumeGithubConnector,
  google_drive: async (connectorId: ModelId) => {
    throw new Error(`Not implemented ${connectorId}`);
  },
  intercom: resumeIntercomConnector,
  webcrawler: (connectorId: ModelId) => {
    throw new Error(`Not implemented ${connectorId}`);
  },
};

export const SYNC_CONNECTOR_BY_TYPE: Record<ConnectorProvider, SyncConnector> =
  {
    confluence: launchConfluenceSyncWorkflow,
    slack: launchSlackSyncWorkflow,
    notion: fullResyncNotionConnector,
    github: fullResyncGithubConnector,
    google_drive: launchGoogleDriveFullSyncWorkflow,
    intercom: fullResyncIntercomSyncWorkflow,
    webcrawler: launchCrawlWebsiteWorkflow,
  };

export const RETRIEVE_CONNECTOR_PERMISSIONS_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorPermissionRetriever
> = {
  confluence: retrieveConfluenceConnectorPermissions,
  slack: retrieveSlackConnectorPermissions,
  github: retrieveGithubConnectorPermissions,
  notion: retrieveNotionConnectorPermissions,
  google_drive: retrieveGoogleDriveConnectorPermissions,
  intercom: retrieveIntercomConnectorPermissions,
  webcrawler: retrieveWebcrawlerConnectorPermissions,
};

export const SET_CONNECTOR_PERMISSIONS_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorPermissionSetter
> = {
  confluence: setConfluenceConnectorPermissions,
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
  intercom: setIntercomConnectorPermissions,
  webcrawler: async () => {
    return new Err(
      new Error(`Setting Webcrawler connector permissions is not applicable.`)
    );
  },
};

export const BATCH_RETRIEVE_RESOURCE_TITLE_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorBatchResourceTitleRetriever
> = {
  confluence: retrieveConfluenceObjectsTitles,
  slack: retrieveSlackChannelsTitles,
  notion: retrieveNotionNodesTitles,
  github: retrieveGithubReposTitles,
  google_drive: retrieveGoogleDriveObjectsTitles,
  intercom: retrieveIntercomNodesTitles,
  webcrawler: retrieveWebCrawlerObjectsTitles,
};

export const BATCH_RETRIEVE_CONTENT_NODES_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorBatchContentNodesRetriever
> = {
  confluence: retrieveConfluenceContentNodes,
  slack: retrieveSlackContentNodes,
  notion: retrieveNotionContentNodes,
  github: retrieveGithubReposContentNodes,
  google_drive: retrieveGoogleDriveContentNodes,
  intercom: retrieveIntercomContentNodes,
  webcrawler: retrieveWebCrawlerContentNodes,
};

export const RETRIEVE_CONTENT_NODE_PARENTS_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorNodeParentsRetriever
> = {
  confluence: retrieveConfluenceContentNodeParents,
  notion: retrieveNotionContentNodeParents,
  google_drive: retrieveGoogleDriveContentNodeParents,
  slack: async () => new Ok([]), // Slack is flat
  github: retrieveGithubContentNodeParents,
  intercom: retrieveIntercomContentNodeParents,
  webcrawler: retrieveWebCrawlerContentNodeParents,
};

export const SET_CONNECTOR_CONFIG_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorConfigSetter
> = {
  confluence: () => {
    throw new Error("Not implemented");
  },
  slack: setSlackConfig,
  notion: async () => {
    throw new Error("Not implemented");
  },
  github: setGithubConfig,
  google_drive: setGoogleDriveConfig,
  intercom: async () => {
    throw new Error("Not implemented");
  },
  webcrawler: async () => {
    throw new Error("Not implemented");
  },
};

export const GET_CONNECTOR_CONFIG_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorConfigGetter
> = {
  confluence: () => {
    throw new Error("Not implemented");
  },
  slack: getSlackConfig,
  notion: async () => {
    throw new Error("Not implemented");
  },
  github: getGithubConfig,
  google_drive: getGoogleDriveConfig,
  intercom: async () => {
    throw new Error("Not implemented");
  },
  webcrawler: () => {
    throw new Error("Not implemented");
  },
};

export const GARBAGE_COLLECT_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorGarbageCollector
> = {
  confluence: () => {
    throw new Error("Not implemented");
  },
  slack: () => {
    throw new Error("Not implemented");
  },
  notion: async () => {
    throw new Error("Not implemented");
  },
  github: async () => {
    throw new Error("Not implemented");
  },
  google_drive: googleDriveGarbageCollect,
  intercom: async () => {
    throw new Error("Not implemented");
  },
  webcrawler: () => {
    throw new Error("Not implemented");
  },
};
