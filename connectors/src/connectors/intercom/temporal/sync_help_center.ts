import type { ModelId } from "@dust-tt/types";
import TurndownService from "turndown";

import { getIntercomAccessToken } from "@connectors/connectors/intercom/lib/intercom_access_token";
import { fetchIntercomCollections } from "@connectors/connectors/intercom/lib/intercom_api";
import type {
  IntercomArticleType,
  IntercomCollectionType,
} from "@connectors/connectors/intercom/lib/types";
import {
  getArticleInAppUrl,
  getCollectionInAppUrl,
  getHelpCenterArticleInternalId,
  getHelpCenterCollectionInternalId,
  getHelpCenterInternalId,
} from "@connectors/connectors/intercom/lib/utils";
import {
  deleteFromDataSource,
  renderDocumentTitleAndContent,
  renderMarkdownSection,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import type { IntercomHelpCenter } from "@connectors/lib/models/intercom";
import {
  IntercomArticle,
  IntercomCollection,
} from "@connectors/lib/models/intercom";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const turndownService = new TurndownService();

/**
 * If our rights were revoked or the help center is not on intercom anymore we delete it
 */
export async function removeHelpCenter({
  connectorId,
  dataSourceConfig,
  helpCenter,
  loggerArgs,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  helpCenter: IntercomHelpCenter;
  loggerArgs: Record<string, string | number>;
}): Promise<void> {
  const level1Collections = await IntercomCollection.findAll({
    where: {
      connectorId,
      helpCenterId: helpCenter.helpCenterId,
      parentId: null,
    },
  });
  await Promise.all(
    level1Collections.map(async (collection) => {
      await deleteCollectionWithChildren({
        connectorId,
        dataSourceConfig,
        collection,
        loggerArgs,
      });
    })
  );
  await helpCenter.destroy();
}

/**
 * Deletes a collection and its children (collection & articles) from the database and the core data source.
 */
export async function deleteCollectionWithChildren({
  connectorId,
  dataSourceConfig,
  collection,
  loggerArgs,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  collection: IntercomCollection;
  loggerArgs: Record<string, string | number>;
}) {
  const collectionId = collection.collectionId;

  if (!collectionId) {
    logger.error(
      { connectorId, collection },
      "[Intercom] Collection has no id. Skipping deleteCollectionWithChildren."
    );
    return;
  }

  // We delete all articles in the collection
  const articles = await IntercomArticle.findAll({
    where: {
      connectorId,
      parentId: collectionId,
    },
  });
  await Promise.all(
    articles.map(async (article) => {
      const dsArticleId = getHelpCenterArticleInternalId(
        connectorId,
        article.articleId
      );
      await Promise.all([
        deleteFromDataSource(dataSourceConfig, dsArticleId),
        article.destroy(),
      ]);
    })
  );

  // Then we delete the collection
  await collection.destroy();
  logger.info(
    { ...loggerArgs, collectionId },
    "[Intercom] Collection deleted."
  );

  // Then we call ourself recursively on the children collections
  const childrenCollections = await IntercomCollection.findAll({
    where: {
      connectorId,
      parentId: collectionId,
    },
  });
  await Promise.all(
    childrenCollections.map(async (c) => {
      await deleteCollectionWithChildren({
        connectorId,
        dataSourceConfig,
        collection: c,
        loggerArgs,
      });
    })
  );
}

/**
 * Syncs a collection and its children (collection & articles) from the database and the core data source.
 */
export async function upsertCollectionWithChildren({
  connectorId,
  connectionId,
  helpCenterId,
  collection,
  region,
  currentSyncMs,
}: {
  connectorId: ModelId;
  connectionId: string;
  helpCenterId: string;
  collection: IntercomCollectionType;
  region: string;
  currentSyncMs: number;
}) {
  const collectionId = collection.id;
  if (!collectionId) {
    logger.error(
      { connectorId, helpCenterId, collection },
      "[Intercom] Collection has no id. Skipping upsertCollectionWithChildren."
    );
    return;
  }

  // Sync the Collection
  let collectionOnDb = await IntercomCollection.findOne({
    where: {
      connectorId,
      collectionId,
    },
  });

  const fallbackCollectionUrl = getCollectionInAppUrl(collection, region);

  if (collectionOnDb) {
    await collectionOnDb.update({
      name: collection.name,
      description: collection.description,
      parentId: collection.parent_id,
      url: collection.url || fallbackCollectionUrl,
      lastUpsertedTs: new Date(currentSyncMs),
    });
  } else {
    collectionOnDb = await IntercomCollection.create({
      connectorId: connectorId,
      collectionId: collection.id,
      intercomWorkspaceId: collection.workspace_id,
      helpCenterId: helpCenterId,
      parentId: collection.parent_id,
      name: collection.name,
      description: collection.description,
      url: collection.url || fallbackCollectionUrl,
      permission: "read",
      lastUpsertedTs: new Date(currentSyncMs),
    });
  }

  // Then we call ourself recursively on the children collections
  const accessToken = await getIntercomAccessToken(connectionId);
  const childrenCollectionsOnIntercom = await fetchIntercomCollections({
    accessToken,
    helpCenterId,
    parentId: collection.id,
  });

  await Promise.all(
    childrenCollectionsOnIntercom.map(async (collectionOnIntercom) => {
      await upsertCollectionWithChildren({
        connectorId,
        connectionId,
        helpCenterId,
        collection: collectionOnIntercom,
        region,
        currentSyncMs,
      });
    })
  );
}

/**
 * Syncs an Article on the database, and the core data source if not up to date.
 */
export async function upsertArticle({
  connectorId,
  helpCenterId,
  article,
  region,
  parentCollection,
  isHelpCenterWebsiteTurnedOn,
  currentSyncMs,
  forceResync,
  dataSourceConfig,
  loggerArgs,
}: {
  connectorId: ModelId;
  helpCenterId: string;
  article: IntercomArticleType;
  region: string;
  parentCollection: IntercomCollection;
  isHelpCenterWebsiteTurnedOn: boolean;
  currentSyncMs: number;
  forceResync: boolean;
  dataSourceConfig: DataSourceConfig;
  loggerArgs: Record<string, string | number>;
}) {
  let articleOnDb = await IntercomArticle.findOne({
    where: {
      connectorId,
      articleId: article.id,
    },
  });

  const articleUpdatedAtDate = new Date(article.updated_at * 1000);

  const shouldUpsertDatasource =
    forceResync ||
    !articleOnDb ||
    !articleOnDb.lastUpsertedTs ||
    articleOnDb.lastUpsertedTs < articleUpdatedAtDate;

  // Article url is working only if the help center has activated the website feature
  // Otherwise they generate an url that is not working
  // So as a workaround we use the url of the article in the intercom app
  const articleUrl = isHelpCenterWebsiteTurnedOn
    ? article.url
    : getArticleInAppUrl(article, region);

  const parentCollectionId = article.parent_id?.toString();
  const parentCollectionIds = article.parent_ids.map((id) => id.toString());

  if (!parentCollectionId) {
    logger.error(
      {
        connectorId,
        helpCenterId,
        articleId: article.id,
        loggerArgs,
      },
      "[Intercom] Article has no parent. Skipping sync"
    );
    return;
  }

  if (articleOnDb) {
    articleOnDb = await articleOnDb.update({
      title: article.title,
      url: articleUrl,
      authorId: article.author_id,
      parentId: parentCollectionId,
      parentType: article.parent_type === "collection" ? "collection" : null,
      parents: parentCollectionIds,
      state: article.state === "published" ? "published" : "draft",
    });
  } else {
    articleOnDb = await IntercomArticle.create({
      connectorId: connectorId,
      articleId: article.id,
      title: article.title,
      url: articleUrl,
      intercomWorkspaceId: article.workspace_id,
      authorId: article.author_id,
      parentId: parentCollectionId,
      parentType: article.parent_type === "collection" ? "collection" : null,
      parents: parentCollectionIds,
      state: article.state === "published" ? "published" : "draft",
      permission: "read",
    });
  }

  if (!shouldUpsertDatasource) {
    // Article is already up to date, we don't need to update the datasource
    logger.info(
      {
        ...loggerArgs,
        connectorId,
        articleId: article.id,
        articleUpdatedAt: articleUpdatedAtDate,
        dataSourcelastUpsertedAt: articleOnDb?.lastUpsertedTs ?? null,
      },
      "[Intercom] Article already up to date. Skipping sync."
    );
    return;
  } else {
    logger.info(
      {
        ...loggerArgs,
        connectorId,
        articleId: article.id,
        articleUpdatedAt: articleUpdatedAtDate,
        dataSourcelastUpsertedAt: articleOnDb?.lastUpsertedTs ?? null,
      },
      "[Intercom] Article to sync."
    );
  }

  const categoryContent =
    parentCollection.name + parentCollection.description
      ? ` - ${parentCollection.description}`
      : "";

  const articleContentInMarkdown =
    typeof article.body === "string"
      ? turndownService.turndown(article.body)
      : "";

  // append the collection description at the beginning of the article
  const markdown = `CATEGORY: ${categoryContent}\n\n${articleContentInMarkdown}`;

  if (articleContentInMarkdown) {
    const createdAtDate = new Date(article.created_at * 1000);
    const updatedAtDate = new Date(article.updated_at * 1000);

    const renderedMarkdown = await renderMarkdownSection(
      dataSourceConfig,
      markdown
    );
    const renderedPage = await renderDocumentTitleAndContent({
      dataSourceConfig,
      title: article.title,
      content: renderedMarkdown,
      createdAt: createdAtDate,
      updatedAt: updatedAtDate,
    });

    const documentId = getHelpCenterArticleInternalId(connectorId, article.id);

    const parents = await getParentIdsForArticle({
      documentId,
      connectorId,
      parentCollectionId,
      helpCenterId,
    });

    await upsertToDatasource({
      dataSourceConfig,
      documentId,
      documentContent: renderedPage,
      documentUrl: articleUrl,
      timestampMs: updatedAtDate.getTime(),
      tags: [
        `title:${article.title}`,
        `createdAt:${createdAtDate.getTime()}`,
        `updatedAt:${updatedAtDate.getTime()}`,
      ],
      parents,
      loggerArgs: {
        ...loggerArgs,
        articleId: article.id,
      },
      upsertContext: {
        sync_type: "batch",
      },
      async: true,
    });
    await articleOnDb.update({
      lastUpsertedTs: new Date(currentSyncMs),
    });
  } else {
    logger.warn(
      { ...loggerArgs, connectorId, articleId: article.id },
      "[Intercom] Article has no content. Skipping sync."
    );
  }
}

// Parents in the Core datasource should map the internal ids that we use in the permission modal
// Order is important: We want the id of the article, then all parents collection in order, then the help center
async function getParentIdsForArticle({
  documentId,
  connectorId,
  parentCollectionId,
  helpCenterId,
}: {
  documentId: string;
  connectorId: number;
  parentCollectionId: string;
  helpCenterId: string;
}) {
  // Initialize the internal IDs array with the article ID.
  const parentIds = [documentId];

  // Add the parent collection ID.
  parentIds.push(
    getHelpCenterCollectionInternalId(connectorId, parentCollectionId)
  );

  // Fetch and add any grandparent collection IDs.
  let currentParentId = parentCollectionId;

  // There's max 2-levels on Intercom.
  for (let i = 0; i < 2; i++) {
    const currentParent = await IntercomCollection.findOne({
      where: {
        connectorId,
        collectionId: currentParentId,
      },
    });

    if (currentParent && currentParent.parentId) {
      currentParentId = currentParent.parentId;
      parentIds.push(
        getHelpCenterCollectionInternalId(connectorId, currentParentId)
      );
    } else {
      break;
    }
  }

  // Add the help center internal ID.
  parentIds.push(getHelpCenterInternalId(connectorId, helpCenterId));

  return parentIds;
}
