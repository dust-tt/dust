import type { ModelId } from "@dust-tt/types";
import type { Client as IntercomClient } from "intercom-client";
import TurndownService from "turndown";

import type { IntercomCollectionType } from "@connectors/connectors/intercom/lib/intercom_api";
import {
  fetchIntercomArticles,
  fetchIntercomCollection,
  fetchIntercomCollections,
  getIntercomClient,
} from "@connectors/connectors/intercom/lib/intercom_api";
import {
  getArticleInAppUrl,
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
      await _deleteCollection({
        connectorId,
        dataSourceConfig,
        collection,
        loggerArgs,
      });
    })
  );
  await helpCenter.destroy();
}

export async function syncCollection({
  connectorId,
  connectionId,
  isHelpCenterWebsiteTurnedOn,
  collection,
  dataSourceConfig,
  loggerArgs,
  currentSyncMs,
}: {
  connectorId: ModelId;
  connectionId: string;
  isHelpCenterWebsiteTurnedOn: boolean;
  collection: IntercomCollection;
  dataSourceConfig: DataSourceConfig;
  loggerArgs: Record<string, string | number>;
  currentSyncMs: number;
}) {
  if (collection.permission === "none") {
    await _deleteCollection({
      connectorId,
      collection,
      dataSourceConfig,
      loggerArgs,
    });
  } else {
    const intercomClient = await getIntercomClient(connectionId);
    const collectionOnIntercom = await fetchIntercomCollection(
      intercomClient,
      collection.collectionId
    );
    if (collectionOnIntercom) {
      await _upsertCollection({
        connectorId,
        collection: collectionOnIntercom,
        isHelpCenterWebsiteTurnedOn,
        parents: [],
        dataSourceConfig,
        intercomClient,
        loggerArgs,
        currentSyncMs,
      });
    } else {
      await _deleteCollection({
        connectorId,
        collection,
        dataSourceConfig,
        loggerArgs,
      });
    }
  }
}

/**
 * Deletes a collection and its children (collection & articles) from the database and the core data source.
 */
export async function _deleteCollection({
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
        deleteFromDataSource(
          {
            dataSourceName: dataSourceConfig.dataSourceName,
            workspaceId: dataSourceConfig.workspaceId,
            workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
          },
          dsArticleId
        ),
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
    childrenCollections.map(async (collection) => {
      await _deleteCollection({
        connectorId,
        dataSourceConfig,
        collection,
        loggerArgs,
      });
    })
  );
}

/**
 * Syncs a collection and its children (collection & articles) from the database and the core data source.
 */
export async function _upsertCollection({
  connectorId,
  intercomClient,
  dataSourceConfig,
  loggerArgs,
  collection,
  isHelpCenterWebsiteTurnedOn,
  parents,
  currentSyncMs,
}: {
  connectorId: ModelId;
  intercomClient: IntercomClient;
  dataSourceConfig: DataSourceConfig;
  collection: IntercomCollectionType;
  isHelpCenterWebsiteTurnedOn: boolean;
  loggerArgs: Record<string, string | number>;
  parents: string[];
  currentSyncMs: number;
}) {
  // Sync the Collection
  let collectionOnDb = await IntercomCollection.findOne({
    where: {
      connectorId,
      collectionId: collection.id,
    },
  });

  if (collectionOnDb) {
    await collectionOnDb.update({
      name: collection.name,
      description: collection.description,
      parentId: collection.parent_id,
      url: collection.url,
      lastUpsertedTs: new Date(currentSyncMs),
    });
  } else {
    collectionOnDb = await IntercomCollection.create({
      connectorId: connectorId,
      collectionId: collection.id,
      intercomWorkspaceId: collection.workspace_id,
      helpCenterId: collection.help_center_id,
      parentId: collection.parent_id,
      name: collection.name,
      description: collection.description,
      url: collection.url,
      permission: "read",
      lastUpsertedTs: new Date(currentSyncMs),
    });
  }

  // Sync the Collection's articles
  const [childrenArticlesOnIntercom, childrenArticlesOnDb] = await Promise.all([
    fetchIntercomArticles(intercomClient, collection.id),
    IntercomArticle.findAll({
      where: { connectorId, parentId: collection.id },
    }),
  ]);

  const promises = childrenArticlesOnIntercom.map(async (articleOnIntercom) => {
    const matchingArticleOnDb = childrenArticlesOnDb.find(
      (article) => article.articleId === articleOnIntercom.id
    );
    let article = null;

    // Article url is working only if the help center has activated the website feature
    // Otherwise they generate an url that is not working
    // So as a workaround we use the url of the article in the intercom app
    const articleUrl = isHelpCenterWebsiteTurnedOn
      ? articleOnIntercom.url
      : getArticleInAppUrl(articleOnIntercom);

    if (matchingArticleOnDb) {
      article = await matchingArticleOnDb.update({
        title: articleOnIntercom.title,
        url: articleUrl,
        authorId: articleOnIntercom.author_id,
        parentId: articleOnIntercom.parent_id,
        parentType:
          articleOnIntercom.parent_type === "collection" ? "collection" : null,
        parents: articleOnIntercom.parent_ids,
        state: articleOnIntercom.state === "published" ? "published" : "draft",
        lastUpsertedTs: new Date(currentSyncMs),
      });
    } else {
      article = await IntercomArticle.create({
        connectorId: connectorId,
        articleId: articleOnIntercom.id,
        title: articleOnIntercom.title,
        url: articleUrl,
        intercomWorkspaceId: articleOnIntercom.workspace_id,
        authorId: articleOnIntercom.author_id,
        parentId: articleOnIntercom.parent_id,
        parentType:
          articleOnIntercom.parent_type === "collection" ? "collection" : null,
        parents: articleOnIntercom.parent_ids,
        state: articleOnIntercom.state === "published" ? "published" : "draft",
        permission: "read",
        lastUpsertedTs: new Date(currentSyncMs),
      });
    }

    const articleContentInMarkdown = turndownService.turndown(
      articleOnIntercom.body
    );
    // append the collection description at the beginning of the article
    const markdown = `CATEGORY: ${collection.description}\n\n${articleContentInMarkdown}`;

    if (articleContentInMarkdown) {
      const createdAtDate = new Date(articleOnIntercom.created_at * 1000);
      const updatedAtDate = new Date(articleOnIntercom.updated_at * 1000);

      const renderedMarkdown = await renderMarkdownSection(
        dataSourceConfig,
        markdown
      );
      const renderedPage = await renderDocumentTitleAndContent({
        dataSourceConfig,
        title: articleOnIntercom.title,
        content: renderedMarkdown,
        createdAt: createdAtDate,
        updatedAt: updatedAtDate,
      });

      // Parents in the Core datasource should map the internal ids that we use in the permission modal
      // Parents of an article are all the collections above it and the help center
      const parentsInternalsIds = articleOnIntercom.parent_ids.map((id) =>
        getHelpCenterCollectionInternalId(connectorId, id)
      );
      parentsInternalsIds.push(
        getHelpCenterInternalId(connectorId, collection.help_center_id)
      );

      return upsertToDatasource({
        dataSourceConfig,
        documentId: getHelpCenterArticleInternalId(
          connectorId,
          articleOnIntercom.id
        ),
        documentContent: renderedPage,
        documentUrl: articleUrl,
        timestampMs: articleOnIntercom.updated_at,
        tags: [
          `title:${articleOnIntercom.title}`,
          `createdAt:${createdAtDate.getTime()}`,
          `updatedAt:${updatedAtDate.getTime()}`,
        ],
        parents: parentsInternalsIds,
        retries: 3,
        delayBetweenRetriesMs: 500,
        loggerArgs: {
          ...loggerArgs,
          articleId: article.id,
        },
        upsertContext: {
          sync_type: "batch",
        },
      });
    }
  });
  await Promise.all(promises);

  logger.info(
    { ...loggerArgs, collectionId: collection.id },
    "[Intercom] Collection synced."
  );

  // Then we call ourself recursively on the children collections
  const childrenCollectionsOnIntercom = await fetchIntercomCollections(
    intercomClient,
    collection.help_center_id,
    collection.id
  );

  await Promise.all(
    childrenCollectionsOnIntercom.map(async (collectionOnIntercom) => {
      await _upsertCollection({
        connectorId,
        intercomClient,
        dataSourceConfig,
        loggerArgs,
        collection: collectionOnIntercom,
        isHelpCenterWebsiteTurnedOn,
        parents: [...parents, collection.id],
        currentSyncMs,
      });
    })
  );
}
