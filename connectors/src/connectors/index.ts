import type {
  ConnectorProvider,
  ModelId,
  WebCrawlerConfigurationType,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import {
  cleanupConfluenceConnector,
  createConfluenceConnector,
  pauseConfluenceConnector,
  resumeConfluenceConnector,
  retrieveConfluenceConnectorPermissions,
  retrieveConfluenceContentNodeParents,
  retrieveConfluenceContentNodes,
  setConfluenceConnectorPermissions,
  stopConfluenceConnector,
  unpauseConfluenceConnector,
  updateConfluenceConnector,
} from "@connectors/connectors/confluence";
import { launchConfluenceSyncWorkflow } from "@connectors/connectors/confluence/temporal/client";
import {
  cleanupGithubConnector,
  createGithubConnector,
  fullResyncGithubConnector,
  getGithubConfig,
  pauseGithubConnector,
  resumeGithubConnector,
  retrieveGithubConnectorPermissions,
  retrieveGithubContentNodeParents,
  retrieveGithubReposContentNodes,
  setGithubConfig,
  stopGithubConnector,
  unpauseGithubConnector,
  updateGithubConnector,
} from "@connectors/connectors/github";
import {
  cleanupGoogleDriveConnector,
  createGoogleDriveConnector,
  getGoogleDriveConfig,
  googleDriveGarbageCollect,
  pauseGoogleDriveConnector,
  retrieveGoogleDriveConnectorPermissions,
  retrieveGoogleDriveContentNodeParents,
  retrieveGoogleDriveContentNodes,
  setGoogleDriveConfig,
  setGoogleDriveConnectorPermissions,
  unpauseGoogleDriveConnector,
  updateGoogleDriveConnector,
} from "@connectors/connectors/google_drive";
import {
  launchGoogleDriveFullSyncWorkflow,
  launchGoogleDriveIncrementalSyncWorkflow,
} from "@connectors/connectors/google_drive/temporal/client";
import {
  cleanupIntercomConnector,
  createIntercomConnector,
  fullResyncIntercomSyncWorkflow,
  getIntercomConfig,
  pauseIntercomConnector,
  resumeIntercomConnector,
  retrieveIntercomConnectorPermissions,
  retrieveIntercomContentNodeParents,
  retrieveIntercomContentNodes,
  setIntercomConfig,
  setIntercomConnectorPermissions,
  stopIntercomConnector,
  unpauseIntercomConnector,
  updateIntercomConnector,
} from "@connectors/connectors/intercom";
import type {
  ConnectorBatchContentNodesRetriever,
  ConnectorCleaner,
  ConnectorConfigGetter,
  ConnectorConfigSetter,
  ConnectorGarbageCollector,
  ConnectorPauser,
  ConnectorPermissionRetriever,
  ConnectorPermissionSetter,
  ConnectorProviderCreateConnectorMapping,
  ConnectorProviderUpdateConfigurationMapping,
  ConnectorResumer,
  ConnectorStopper,
  ConnectorUnpauser,
  ConnectorUpdater,
  ContentNodeParentsRetriever,
  SyncConnector,
} from "@connectors/connectors/interface";
import {
  cleanupNotionConnector,
  createNotionConnector,
  fullResyncNotionConnector,
  pauseNotionConnector,
  resumeNotionConnector,
  retrieveNotionConnectorPermissions,
  retrieveNotionContentNodeParents,
  retrieveNotionContentNodes,
  stopNotionConnector,
  unpauseNotionConnector,
  updateNotionConnector,
} from "@connectors/connectors/notion";
import {
  cleanupSlackConnector,
  createSlackConnector,
  getSlackConfig,
  pauseSlackConnector,
  retrieveSlackConnectorPermissions,
  retrieveSlackContentNodes,
  setSlackConfig,
  setSlackConnectorPermissions,
  unpauseSlackConnector,
  updateSlackConnector,
} from "@connectors/connectors/slack";
import { launchSlackSyncWorkflow } from "@connectors/connectors/slack/temporal/client";
import { terminateAllWorkflowsForConnectorId } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";

import {
  cleanupWebcrawlerConnector,
  createWebcrawlerConnector,
  pauseWebcrawlerConnector,
  retrieveWebcrawlerConnectorPermissions,
  retrieveWebCrawlerContentNodeParents,
  retrieveWebCrawlerContentNodes,
  setWebcrawlerConfiguration,
  stopWebcrawlerConnector,
  unpauseWebcrawlerConnector,
} from "./webcrawler";
import { launchCrawlWebsiteWorkflow } from "./webcrawler/temporal/client";

export const CREATE_CONNECTOR_BY_TYPE: ConnectorProviderCreateConnectorMapping =
  {
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
  ConnectorUpdater
> = {
  confluence: updateConfluenceConnector,
  slack: updateSlackConnector,
  notion: updateNotionConnector,
  github: updateGithubConnector,
  google_drive: updateGoogleDriveConnector,
  intercom: updateIntercomConnector,
  webcrawler: () => {
    throw new Error(`Not implemented`);
  },
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
    await terminateAllWorkflowsForConnectorId(connectorId);
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
    const res = await launchGoogleDriveIncrementalSyncWorkflow(connectorId);
    if (res.isErr()) {
      return res;
    }

    return new Ok(undefined);
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
  ContentNodeParentsRetriever
> = {
  confluence: retrieveConfluenceContentNodeParents,
  notion: retrieveNotionContentNodeParents,
  google_drive: retrieveGoogleDriveContentNodeParents,
  slack: async () => new Ok([]), // Slack is flat
  github: retrieveGithubContentNodeParents,
  intercom: retrieveIntercomContentNodeParents,
  webcrawler: retrieveWebCrawlerContentNodeParents,
};

// Old configuration interface that allows to set one config key at a time.
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
  intercom: setIntercomConfig,
  webcrawler: async () => {
    throw new Error("Not implemented");
  },
};

// Old configuration interface that allows to get one config key at a time.
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
  intercom: getIntercomConfig,
  webcrawler: () => {
    throw new Error("Not implemented");
  },
};

export const SET_CONNECTOR_CONFIGURATION_BY_TYPE: ConnectorProviderUpdateConfigurationMapping =
  {
    webcrawler: (
      connectorId: ModelId,
      configuration: WebCrawlerConfigurationType
    ) => setWebcrawlerConfiguration(connectorId, configuration),
    intercom: () => {
      throw new Error("Not implemented");
    },
    slack: () => {
      throw new Error("Not implemented");
    },
    notion: () => {
      throw new Error("Not implemented");
    },
    github: () => {
      throw new Error("Not implemented");
    },
    google_drive: () => {
      throw new Error("Not implemented");
    },
    confluence: () => {
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

// If the connector has webhooks: stop processing them.
// If the connector has long-running workflows: stop them.
// Exclude the connector from the prod checks.
export const PAUSE_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorPauser
> = {
  confluence: pauseConfluenceConnector,
  slack: pauseSlackConnector,
  notion: pauseNotionConnector,
  github: pauseGithubConnector,
  google_drive: pauseGoogleDriveConnector,
  intercom: pauseIntercomConnector,
  webcrawler: pauseWebcrawlerConnector,
};

// If the connector has webhooks: resume processing them, and trigger a full sync.
// If the connector has long-running workflows: resume them. If they support "partial resync" do that, otherwise trigger a full sync.
export const UNPAUSE_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorUnpauser
> = {
  confluence: unpauseConfluenceConnector,
  slack: unpauseSlackConnector,
  notion: unpauseNotionConnector,
  github: unpauseGithubConnector,
  google_drive: unpauseGoogleDriveConnector,
  intercom: unpauseIntercomConnector,
  webcrawler: unpauseWebcrawlerConnector,
};
