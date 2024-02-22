import type { ModelId } from "@dust-tt/types";
import { Op } from "sequelize";

import {
  fetchIntercomArticles,
  fetchIntercomCollection,
  fetchIntercomConversationsForTeamId,
  fetchIntercomHelpCenter,
  fetchIntercomTeam,
} from "@connectors/connectors/intercom/lib/intercom_api";
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
  IntercomConversation,
  IntercomWorkspace,
} from "@connectors/lib/models/intercom";
import {
  IntercomCollection,
  IntercomHelpCenter,
  IntercomTeam,
} from "@connectors/lib/models/intercom";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

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
  const helpCenters = await IntercomHelpCenter.findAll({
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
    dataSourceName: dataSourceConfig.dataSourceName,
  };

  const helpCenterOnDb = await IntercomHelpCenter.findOne({
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
  const helpCenterOnIntercom = await fetchIntercomHelpCenter(
    connector.connectionId,
    helpCenterOnDb.helpCenterId
  );
  if (!helpCenterOnIntercom) {
    await removeHelpCenter({
      connectorId,
      dataSourceConfig,
      helpCenter: helpCenterOnDb,
      loggerArgs,
    });
    return false;
  }

  // If all children collections are not allowed anymore we delete the Help Center data
  const collectionsWithReadPermission = await IntercomCollection.findAll({
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
}) {
  const level1Collections = await IntercomCollection.findAll({
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
}) {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "intercom",
    dataSourceName: dataSourceConfig.dataSourceName,
  };

  const collection = await IntercomCollection.findOne({
    where: {
      connectorId,
      helpCenterId,
      collectionId,
    },
  });
  if (!collection) {
    logger.error(
      { loggerArgs, collectionId },
      "[Intercom] Collection to sync not found"
    );
    return;
  }

  // If our rights were revoked we delete the collection and its children
  if (collection.permission === "none") {
    await deleteCollectionWithChildren({
      connectorId,
      collection,
      dataSourceConfig,
      loggerArgs,
    });
    return;
  }

  // If the collection is not present on Intercom anymore we delete the collection and its children
  const intercomCollection = await fetchIntercomCollection(
    connector.connectionId,
    collection.collectionId
  );
  if (!intercomCollection) {
    await deleteCollectionWithChildren({
      connectorId,
      collection,
      dataSourceConfig,
      loggerArgs,
    });
    return;
  }

  // Otherwise we upsert the collection and its children collections
  await upsertCollectionWithChildren({
    connectorId,
    connectionId: connector.connectionId,
    helpCenterId,
    collection: intercomCollection,
    currentSyncMs,
  });
}

export async function syncArticleBatchActivity({
  connectorId,
  helpCenterId,
  page,
  currentSyncMs,
}: {
  connectorId: ModelId;
  helpCenterId: string;
  page: number;
  currentSyncMs: number;
}): Promise<{ nextPage: number | null }> {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "intercom",
    dataSourceName: dataSourceConfig.dataSourceName,
  };

  const helpCenter = await IntercomHelpCenter.findOne({
    where: {
      connectorId,
    },
  });
  if (!helpCenter) {
    throw new Error("[Intercom] HelpCenter not found");
  }

  const result = await fetchIntercomArticles({
    nangoConnectionId: connector.connectionId,
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

  const collectionsInRead = await IntercomCollection.findAll({
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
      const parentCollectionIdAsString = article.parent_id
        ? article.parent_id.toString()
        : null;
      const parentCollection = collectionsInRead.find(
        (c) => c.collectionId === parentCollectionIdAsString
      );
      if (parentCollection) {
        await upsertArticle({
          connectorId,
          helpCenterId,
          article,
          parentCollection,
          isHelpCenterWebsiteTurnedOn: helpCenter.websiteTurnedOn,
          currentSyncMs,
          dataSourceConfig,
          loggerArgs,
        });
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
    dataSourceName: dataSourceConfig.dataSourceName,
  };

  const teamOnDB = await IntercomTeam.findOne({
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
  const teamOnIntercom = await fetchIntercomTeam(
    connector.connectionId,
    teamId
  );
  if (!teamOnIntercom) {
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
}: {
  connectorId: ModelId;
  teamId: string;
  cursor: string | null;
}): Promise<{ conversationIds: string[]; nextPageCursor: string | null }> {
  const connector = await _getIntercomConnectorOrRaise(connectorId);

  const intercomWorkspace = await IntercomWorkspace.findOne({
    where: {
      connectorId,
    },
  });
  if (!intercomWorkspace) {
    throw new Error("[Intercom] Workspace not found");
  }

  const result = await fetchIntercomConversationsForTeamId({
    nangoConnectionId: connector.connectionId,
    teamId,
    slidingWindow: intercomWorkspace.conversationsSlidingWindow,
    cursor,
    pageSize: INTERCOM_CONVO_BATCH_SIZE,
  });

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
  teamId: string;
  conversationIds: string[];
  currentSyncMs: number;
}): Promise<void> {
  const connector = await _getIntercomConnectorOrRaise(connectorId);
  const nangoConnectionId = connector.connectionId;
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "intercom",
    dataSourceName: dataSourceConfig.dataSourceName,
    teamId,
  };

  await concurrentExecutor(
    conversationIds,
    (conversationId) =>
      fetchAndSyncConversation({
        connectorId,
        nangoConnectionId,
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
 * This activity is responsible for fetching a batch of conversations
 * that are older than 90 days and ready to be deleted.
 */
export async function getNextConversationsBatchToDeleteActivity({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<string[]> {
  const conversations = await IntercomConversation.findAll({
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
