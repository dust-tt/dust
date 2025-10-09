import { Op } from "sequelize";

import { getIntercomAccessToken } from "@connectors/connectors/intercom/lib/intercom_access_token";
import {
  fetchIntercomArticles,
  fetchIntercomCollection,
  fetchIntercomConversations,
  fetchIntercomHelpCenter,
  fetchIntercomTeam,
  fetchIntercomTeams,
} from "@connectors/connectors/intercom/lib/intercom_api";
import type { IntercomSyncAllConversationsStatus } from "@connectors/connectors/intercom/lib/types";
import {
  getHelpCenterInternalId,
  getTeamInternalId,
  getTeamsInternalId,
} from "@connectors/connectors/intercom/lib/utils";
import {
  deleteConversation,
  deleteTeamAndConversations,
  fetchAndSyncConversation,
} from "@connectors/connectors/intercom/temporal/sync_conversation";
import {
  deleteCollectionWithChildren,
  removeHelpCenter,
  upsertArticle,
  upsertCollectionWithChildren,
} from "@connectors/connectors/intercom/temporal/sync_help_center";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  deleteDataSourceFolder,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import {
  IntercomCollectionModel,
  IntercomConversationModel,
  IntercomHelpCenterModel,
  IntercomTeamModel,
  IntercomWorkspaceModel,
} from "@connectors/lib/models/intercom";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

const INTERCOM_CONVO_BATCH_SIZE = 20;
const INTERCOM_ARTICLE_BATCH_SIZE = 20;

async function _getIntercomConnectorOrRaise(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Intercom] Connector not found.");
  }
  return connector;
}

/**
 * This activity is responsible for updating the
 * sync status of the connector to "success".
 */
export async function saveIntercomConnectorSuccessSync({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const res = await syncSucceeded(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

/**
 * This activity is responsible for updating the
 * lastSyncStartTime of the connector to now.
 */
export async function saveIntercomConnectorStartSync({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const res = await syncStarted(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

/**
 * This activity is responsible for retrieving the list
 * of help center ids to sync for a given connector.
 *
 * We sync all the help centers that are in DB.
 */
export async function getHelpCenterIdsToSyncActivity(connectorId: ModelId) {
  const helpCenters = await IntercomHelpCenterModel.findAll({
    attributes: ["helpCenterId"],
    where: {
      connectorId: connectorId,
    },
  });
  return helpCenters.map((i) => i.helpCenterId);
}

/**
 * This activity is responsible for syncing a Help Center
 * It does NOT sync the content inside the Help Center, only the Help Center itself.
 *
 * It's going to udpate the name of the Help Center if it changed.
 * If the Help Center is not allowed anymore, it will delete all its data.
 * If the Help Center is not present on Intercom anymore, it will delete all its data.
 */
export async function syncHelpCenterOnlyActivity({
  connectorId,
  helpCenterId,
  currentSyncMs,
}: {
  connectorId: ModelId;
  helpCenterId: string;
  currentSyncMs: number;
}): Promise<boolean> {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "intercom",
    dataSourceId: dataSourceConfig.dataSourceId,
  };

  const helpCenterOnDb = await IntercomHelpCenterModel.findOne({
    where: {
      connectorId,
      helpCenterId,
    },
  });
  if (!helpCenterOnDb) {
    throw new Error(
      `[Intercom] Help Center not found. ConnectorId: ${connectorId}, HelpCenterId: ${helpCenterId}`
    );
  }

  // If our rights were revoked we delete the Help Center data
  if (helpCenterOnDb.permission === "none") {
    await removeHelpCenter({
      connectorId,
      dataSourceConfig,
      helpCenter: helpCenterOnDb,
      loggerArgs,
    });
    return false;
  }

  // If the help center is not on intercom anymore we delete the Help Center data
  const accessToken = await getIntercomAccessToken(connector.connectionId);
  const helpCenterOnIntercom = await fetchIntercomHelpCenter({
    accessToken,
    helpCenterId: helpCenterOnDb.helpCenterId,
  });
  if (!helpCenterOnIntercom) {
    await removeHelpCenter({
      connectorId,
      dataSourceConfig,
      helpCenter: helpCenterOnDb,
      loggerArgs,
    });
    return false;
  }

  const helpCenterInternalId = getHelpCenterInternalId(
    connectorId,
    helpCenterId
  );
  await upsertDataSourceFolder({
    dataSourceConfig,
    folderId: helpCenterInternalId,
    title: helpCenterOnIntercom.display_name || "Help Center",
    parents: [helpCenterInternalId],
    parentId: null,
    mimeType: INTERNAL_MIME_TYPES.INTERCOM.HELP_CENTER,
    timestampMs: currentSyncMs,
  });

  // If all children collections are not allowed anymore we delete the Help Center data
  const collectionsWithReadPermission = await IntercomCollectionModel.findAll({
    where: {
      connectorId,
      helpCenterId: helpCenterId,
      permission: "read",
      parentId: null,
    },
  });
  if (collectionsWithReadPermission.length === 0) {
    await removeHelpCenter({
      connectorId,
      dataSourceConfig,
      helpCenter: helpCenterOnDb,
      loggerArgs,
    });
    return false;
  }

  // Otherwise we update the help center name and lastUpsertedTs
  await helpCenterOnDb.update({
    name: helpCenterOnIntercom.display_name || "Help Center",
    websiteTurnedOn: helpCenterOnIntercom.website_turned_on,
    lastUpsertedTs: new Date(currentSyncMs),
  });
  return true;
}

/**
 * This activity is responsible for retrieving the list of level 1 Collections,
 * i.e. the ones that have no parent.
 */
export async function getLevel1CollectionsIdsActivity({
  connectorId,
  helpCenterId,
}: {
  connectorId: ModelId;
  helpCenterId: string;
}): Promise<string[]> {
  const level1Collections = await IntercomCollectionModel.findAll({
    where: {
      connectorId,
      helpCenterId: helpCenterId,
      parentId: null,
    },
  });
  return level1Collections.map((i) => i.collectionId);
}

/**
 * This activity is responsible for syncing a Collection of a given Help Center.
 * It will either upsert the Collection or delete it if it's not allowed anymore
 * or not present on Intercom.
 */
export async function syncLevel1CollectionWithChildrenActivity({
  connectorId,
  helpCenterId,
  collectionId,
  currentSyncMs,
}: {
  connectorId: ModelId;
  helpCenterId: string;
  collectionId: string;
  currentSyncMs: number;
}): Promise<{
  collectionId: string;
  action:
    | "upserted"
    | "not_found_db"
    | "deleted_no_permission"
    | "deleted_not_found_intercom";
}> {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "intercom",
    dataSourceId: dataSourceConfig.dataSourceId,
  };

  const intercomWorkspace = await IntercomWorkspaceModel.findOne({
    where: {
      connectorId,
    },
  });
  if (!intercomWorkspace) {
    logger.error(
      { loggerArgs, collectionId },
      "[Intercom] IntercomWorkspace not found"
    );
    return {
      collectionId,
      action: "not_found_db",
    };
  }

  const collectionOnDB = await IntercomCollectionModel.findOne({
    where: {
      connectorId,
      helpCenterId,
      collectionId,
    },
  });
  if (!collectionOnDB) {
    logger.error(
      { loggerArgs, collectionId },
      "[Intercom] Level 1 Collection to sync not found"
    );
    return {
      collectionId,
      action: "not_found_db",
    };
  }

  // If our rights were revoked we delete the collection and its children
  if (collectionOnDB.permission === "none") {
    await deleteCollectionWithChildren({
      connectorId,
      collection: collectionOnDB,
      dataSourceConfig,
      loggerArgs,
    });
    return {
      collectionId,
      action: "deleted_no_permission",
    };
  }

  // If the collection is not present on Intercom anymore we delete the collection and its children
  const accessToken = await getIntercomAccessToken(connector.connectionId);
  const collectionOnIntercom = await fetchIntercomCollection({
    accessToken,
    collectionId: collectionOnDB.collectionId,
  });
  if (collectionOnIntercom === null) {
    await deleteCollectionWithChildren({
      connectorId,
      collection: collectionOnDB,
      dataSourceConfig,
      loggerArgs,
    });
    return {
      collectionId,
      action: "deleted_not_found_intercom",
    };
  }

  // Otherwise we upsert the collection and its children collections
  await upsertCollectionWithChildren({
    connectorId,
    connectionId: connector.connectionId,
    helpCenterId,
    collection: collectionOnIntercom,
    region: intercomWorkspace.region,
    currentSyncMs,
  });

  return {
    collectionId,
    action: "upserted",
  };
}

export async function syncArticleBatchActivity({
  connectorId,
  helpCenterId,
  page,
  currentSyncMs,
  forceResync,
}: {
  connectorId: ModelId;
  helpCenterId: string;
  page: number;
  currentSyncMs: number;
  forceResync: boolean;
}): Promise<{ nextPage: number | null }> {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "intercom",
    dataSourceId: dataSourceConfig.dataSourceId,
  };

  const intercomWorkspace = await IntercomWorkspaceModel.findOne({
    where: {
      connectorId,
    },
  });
  if (!intercomWorkspace) {
    throw new Error("[Intercom] IntercomWorkspace not found");
  }

  const helpCenter = await IntercomHelpCenterModel.findOne({
    where: {
      connectorId,
    },
  });
  if (!helpCenter) {
    throw new Error("[Intercom] HelpCenter not found");
  }
  const accessToken = await getIntercomAccessToken(connector.connectionId);
  const result = await fetchIntercomArticles({
    accessToken,
    helpCenterId,
    page,
    pageSize: INTERCOM_ARTICLE_BATCH_SIZE,
  });

  if (!Array.isArray(result?.data?.articles)) {
    return { nextPage: null };
  }

  const articles = result.data.articles;
  const nextPage =
    result.pages.next && result.pages.page + 1 <= result.pages.total_pages
      ? result.pages.page + 1
      : null;

  const collectionsInRead = await IntercomCollectionModel.findAll({
    where: {
      connectorId,
      helpCenterId,
      permission: "read",
    },
  });

  // We upsert the articles
  await concurrentExecutor(
    articles,
    async (article) => {
      const parentCollectionIds = article.parent_ids.map((id) => id.toString());
      if (parentCollectionIds.length === 0) {
        logger.warn(
          { ...loggerArgs, articleId: article.id },
          "[Intercom] Article has no parent."
        );
        return;
      }
      const parentCollection = collectionsInRead.find(
        (c) => c.collectionId === parentCollectionIds[0]
      );
      if (parentCollection) {
        await upsertArticle({
          connectorId,
          helpCenterId,
          article,
          parentCollection,
          region: intercomWorkspace.region,
          isHelpCenterWebsiteTurnedOn: helpCenter.websiteTurnedOn,
          currentSyncMs,
          forceResync,
          dataSourceConfig,
          loggerArgs,
        });
      } else {
        logger.warn(
          { ...loggerArgs, articleId: article.id },
          "[Intercom] Article has no parent collection."
        );
      }
    },
    { concurrency: 4 }
  );

  return { nextPage };
}

/**
 * This activity is responsible for syncing the conversations of a given Team.
 * If the team is not allowed anymore, it will delete all its data.
 * If the team is not present on Intercom anymore, it will delete all its data.
 * If the team is present on Intercom and is allowed, it will sync its conversations.
 */
export async function syncTeamOnlyActivity({
  connectorId,
  teamId,
  currentSyncMs,
}: {
  connectorId: ModelId;
  teamId: string;
  currentSyncMs: number;
}): Promise<boolean> {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "intercom",
    dataSourceId: dataSourceConfig.dataSourceId,
  };

  const intercomWorkspace = await IntercomWorkspaceModel.findOne({
    where: { connectorId: connector.id },
  });

  if (!intercomWorkspace) {
    throw new Error("Error retrieving intercom workspace to update connector");
  }

  const teamOnDB = await IntercomTeamModel.findOne({
    where: {
      connectorId,
      teamId,
    },
  });
  if (!teamOnDB) {
    logger.error({ loggerArgs, teamId }, "[Intercom] Team not found");
    return false;
  }

  // If our rights were revoked we delete the team and its conversations
  if (teamOnDB.permission === "none") {
    await deleteTeamAndConversations({
      connectorId,
      dataSourceConfig,
      team: teamOnDB,
    });
    return false;
  }

  // If the team does not exists on Intercom we delete the team and its conversations
  const accessToken = await getIntercomAccessToken(connector.connectionId);
  let teamOnIntercom;
  try {
    teamOnIntercom = await fetchIntercomTeam({ accessToken, teamId });
    if (!teamOnIntercom || teamOnIntercom.type !== "team") {
      await deleteTeamAndConversations({
        connectorId,
        dataSourceConfig,
        team: teamOnDB,
      });
      return false;
    }

    // Otherwise we update the team name and lastUpsertedTs
    await teamOnDB.update({
      name: teamOnIntercom.name,
      lastUpsertedTs: new Date(currentSyncMs),
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error : JSON.stringify(error),
        ...(error instanceof Error && {
          errorMessage: error.message || "Unknown error",
          errorStack: error.stack,
        }),
        teamId,
        ...loggerArgs,
      },
      "[Intercom] Failed to fetch team"
    );
    throw error;
  }

  // Also make sure a datasource folder node is created for the team
  const teamInternalId = getTeamInternalId(connectorId, teamOnDB.teamId);
  const syncAllActivated =
    intercomWorkspace.syncAllConversations === "activated" ||
    intercomWorkspace.syncAllConversations === "scheduled_activate";
  await upsertDataSourceFolder({
    dataSourceConfig: dataSourceConfigFromConnector(connector),
    folderId: teamInternalId,
    title: teamOnIntercom.name,
    parents: [
      teamInternalId,
      ...(syncAllActivated ? [getTeamsInternalId(connectorId)] : []),
    ],
    parentId: syncAllActivated ? getTeamsInternalId(connectorId) : null,
    mimeType: INTERNAL_MIME_TYPES.INTERCOM.TEAM,
    timestampMs: currentSyncMs,
  });

  return true;
}

/**
 * This activity is responsible for getting the next batch
 * of conversations to sync for a given team.
 */
export async function getNextConversationBatchToSyncActivity({
  connectorId,
  teamId,
  cursor,
  lastHourOnly,
}: {
  connectorId: ModelId;
  teamId?: string;
  cursor: string | null;
  lastHourOnly?: boolean;
}): Promise<{ conversationIds: string[]; nextPageCursor: string | null }> {
  const connector = await _getIntercomConnectorOrRaise(connectorId);

  const intercomWorkspace = await IntercomWorkspaceModel.findOne({
    where: {
      connectorId,
    },
  });
  if (!intercomWorkspace) {
    throw new Error("[Intercom] Workspace not found");
  }

  let result;

  const accessToken = await getIntercomAccessToken(connector.connectionId);
  const closedAfter = lastHourOnly
    ? new Date(Date.now() - 1 * 60 * 60 * 1000).getTime()
    : undefined;

  if (teamId) {
    result = await fetchIntercomConversations({
      accessToken,
      teamId,
      slidingWindow: intercomWorkspace.conversationsSlidingWindow,
      cursor,
      pageSize: INTERCOM_CONVO_BATCH_SIZE,
      closedAfter,
    });
  } else {
    result = await fetchIntercomConversations({
      accessToken,
      slidingWindow: intercomWorkspace.conversationsSlidingWindow,
      cursor,
      pageSize: INTERCOM_CONVO_BATCH_SIZE,
      closedAfter,
    });
  }

  const conversationIds = result.conversations.map((c) => c.id);
  const nextPageCursor = result.pages.next
    ? result.pages.next.starting_after
    : null;

  return { conversationIds, nextPageCursor };
}

/**
 * This activity is responsible for syncing a batch of conversations.
 */
export async function syncConversationBatchActivity({
  connectorId,
  teamId,
  conversationIds,
  currentSyncMs,
}: {
  connectorId: ModelId;
  teamId?: string;
  conversationIds: string[];
  currentSyncMs: number;
}): Promise<void> {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "intercom",
    dataSourceId: dataSourceConfig.dataSourceId,
    teamId: teamId ?? null,
  };

  await concurrentExecutor(
    conversationIds,
    (conversationId) =>
      fetchAndSyncConversation({
        connectorId,
        connectionId: connector.connectionId,
        dataSourceConfig,
        conversationId,
        currentSyncMs,
        syncType: "batch",
        loggerArgs,
      }),
    { concurrency: 10 }
  );
}

/**
 * This activity is responsible for fetching all the teams and syncing them both with connectors (intercom_teams) and
 * core db (data_sources_folders/nodes).
 */
export async function syncAllTeamsActivity({
  connectorId,
  currentSyncMs,
}: {
  connectorId: ModelId;
  currentSyncMs: number;
}): Promise<void> {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const accessToken = await getIntercomAccessToken(connector.connectionId);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const teamsOnIntercom = await fetchIntercomTeams({ accessToken });

  for (const teamOnIntercom of teamsOnIntercom) {
    const teamOnDb = await IntercomTeamModel.findOne({
      where: { connectorId, teamId: teamOnIntercom.id },
    });
    const folderId = getTeamInternalId(connectorId, teamOnIntercom.id);

    // Upsert the folder in core to either create it or override the parents.
    await upsertDataSourceFolder({
      dataSourceConfig,
      folderId,
      title: teamOnIntercom.name,
      parents: [folderId, getTeamsInternalId(connectorId)],
      parentId: getTeamsInternalId(connectorId),
      mimeType: INTERNAL_MIME_TYPES.INTERCOM.TEAM,
      timestampMs: currentSyncMs,
    });

    // We create a team in db with permission "none" because if it was not already in db it means that it was not explicitly selected by the user.
    // We need to create these teams to make it possible to delete the entries in the core db when the user unselects the All Conversations button.
    if (!teamOnDb) {
      await IntercomTeamModel.create({
        connectorId,
        teamId: teamOnIntercom.id,
        name: teamOnIntercom.name,
        permission: "none",
        lastUpsertedTs: new Date(currentSyncMs),
      });
    } else {
      await teamOnDb.update({
        name: teamOnIntercom.name,
        lastUpsertedTs: new Date(currentSyncMs),
      });
    }
  }
}

/**
 * This activity is responsible for getting the list of team ids
 * that can be synced for a given connector.
 */
export async function getTeamIdsToSyncActivity({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<string[]> {
  const teamsWithReadPermission = await IntercomTeamModel.findAll({
    where: {
      connectorId,
      permission: "read",
    },
    attributes: ["teamId"],
  });

  return teamsWithReadPermission.map((team) => team.teamId);
}

/**
 * This activity is responsible for deleting the data_sources_folders for the teams that are not allowed.
 */
export async function deleteRevokedTeamsActivity({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<void> {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const unauthorizedTeams = await IntercomTeamModel.findAll({
    attributes: ["teamId"],
    where: { connectorId, permission: "none" },
  });
  const unauthorizedTeamIds = unauthorizedTeams.map((t) => t.teamId);

  for (const teamId of unauthorizedTeamIds) {
    await deleteDataSourceFolder({
      dataSourceConfig,
      folderId: getTeamInternalId(connectorId, teamId),
      loggerArgs: { provider: "intercom" },
    });
  }
}

/**
 * This activity is responsible for fetching a batch of conversations
 * that belong to a team that is not allowed anymore, or no team.
 */
export async function getNextRevokedConversationsBatchToDeleteActivity({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<string[]> {
  const authorizedTeams = await IntercomTeamModel.findAll({
    attributes: ["teamId"],
    where: {
      connectorId,
      permission: "read",
    },
  });
  const authorizedTeamIds = authorizedTeams.map((t) => t.teamId);
  const conversations = await IntercomConversationModel.findAll({
    attributes: ["conversationId"],
    where: {
      connectorId,
      teamId: {
        [Op.or]: [null, { [Op.notIn]: authorizedTeamIds }],
      },
    },
    limit: INTERCOM_CONVO_BATCH_SIZE,
  });

  return conversations.map((c) => c.conversationId);
}

/**
 * This activity is responsible for fetching a batch of conversations
 * that are older than 90 days and ready to be deleted.
 */
export async function getNextOldConversationsBatchToDeleteActivity({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<string[]> {
  const conversations = await IntercomConversationModel.findAll({
    attributes: ["conversationId"],
    where: {
      connectorId,
      conversationCreatedAt: {
        [Op.lt]: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
      },
    },
    limit: INTERCOM_CONVO_BATCH_SIZE,
  });

  return conversations.map((c) => c.conversationId);
}

/**
 * This activity is responsible for syncing a batch of conversations.
 */
export async function deleteConversationBatchActivity({
  connectorId,
  conversationIds,
}: {
  connectorId: ModelId;
  conversationIds: string[];
}): Promise<void> {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  await concurrentExecutor(
    conversationIds,
    (conversationId) =>
      deleteConversation({
        connectorId,
        conversationId,
        dataSourceConfig,
      }),
    { concurrency: 10 }
  );
}

/**
 * This activity is responsible for updating the status of syncAllConversations of a given connector.
 */
export async function setSyncAllConversationsStatusActivity({
  connectorId,
  status,
}: {
  connectorId: ModelId;
  status: IntercomSyncAllConversationsStatus;
}): Promise<void> {
  await IntercomWorkspaceModel.update(
    {
      syncAllConversations: status,
    },
    {
      where: {
        connectorId,
      },
    }
  );
}

/**
 * This activity is responsible for fetching if the syncAllConversations of a given connector.
 */
export async function getSyncAllConversationsStatusActivity({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<IntercomSyncAllConversationsStatus> {
  const intercomWorkspace = await IntercomWorkspaceModel.findOne({
    where: {
      connectorId,
    },
  });

  if (!intercomWorkspace) {
    throw new Error("[Intercom] Workspace not found");
  }

  return intercomWorkspace.syncAllConversations;
}

export async function upsertIntercomTeamsFolderActivity({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  await upsertDataSourceFolder({
    dataSourceConfig,
    folderId: getTeamsInternalId(connectorId),
    title: "Conversations",
    parents: [getTeamsInternalId(connectorId)],
    parentId: null,
    mimeType: INTERNAL_MIME_TYPES.INTERCOM.TEAMS_FOLDER,
  });
}
