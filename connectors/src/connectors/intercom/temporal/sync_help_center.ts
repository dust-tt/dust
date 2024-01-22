import type { ModelId } from "@dust-tt/types";
import type { Client as IntercomClient } from "intercom-client";
import type { Transaction } from "sequelize";

import type { IntercomCollectionType } from "@connectors/connectors/intercom/lib/intercom_api";
import {
  fetchIntercomArticles,
  fetchIntercomCollection,
  fetchIntercomCollections,
  fetchIntercomHelpCenter,
} from "@connectors/connectors/intercom/lib/intercom_api";
import {
  getHelpCenterArticleDocumentId,
  getHelpCenterCollectionDocumentId,
} from "@connectors/connectors/intercom/lib/utils";
import {
  deleteFromDataSource,
  renderDocumentTitleAndContent,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import type { Connector } from "@connectors/lib/models";
import type { IntercomHelpCenter } from "@connectors/lib/models/intercom";
import {
  IntercomArticle,
  IntercomCollection,
} from "@connectors/lib/models/intercom";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

/**
 * This function syncs a Help Center and its children (collections & articles)
 * from Intercom to the database and the core data source.
 *
 * If the Help Center is not on Intercom anymore or if we have revoked permissions:
 * -> We delete it and its children from the database and the core data source.
 *
 * If the Help Center is on Intercom and we have read permissions:
 * -> We loop on all level 1 collections of the Help Center and sync them.
 */
export async function syncHelpCenter({
  connector,
  intercomClient,
  dataSourceConfig,
  helpCenter,
  loggerArgs,
  transaction,
}: {
  connector: Connector;
  intercomClient: IntercomClient;
  dataSourceConfig: DataSourceConfig;
  helpCenter: IntercomHelpCenter;
  loggerArgs: Record<string, string | number>;
  transaction: Transaction;
}) {
  const connectorId = connector.id;
  const helpCenterOnIntercom = await fetchIntercomHelpCenter(
    connector.connectionId,
    helpCenter.helpCenterId
  );

  // If our rights were revoked or the help center is not on intercom anymore we delete it
  if (!helpCenterOnIntercom || helpCenter.permission === "none") {
    const level1Collections = await IntercomCollection.findAll({
      where: {
        connectorId: connector.id,
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
          transaction,
        });
      })
    );
    await helpCenter.destroy({ transaction });
    return;
  }

  // Otherwise we update its name and sync its collections
  await helpCenter.update(
    { name: helpCenterOnIntercom.display_name },
    { transaction }
  );
  const level1Collections = await IntercomCollection.findAll({
    where: {
      connectorId,
      helpCenterId: helpCenter.helpCenterId,
      parentId: null,
    },
  });
  await Promise.all(
    level1Collections.map(async (collection) => {
      if (collection.permission === "none") {
        await _deleteCollection({
          connectorId,
          dataSourceConfig,
          collection,
          loggerArgs,
          transaction,
        });
      } else {
        const collectionOnIntercom = await fetchIntercomCollection(
          intercomClient,
          collection.collectionId
        );
        if (!collectionOnIntercom) {
          await _deleteCollection({
            connectorId,
            dataSourceConfig,
            collection,
            loggerArgs,
            transaction,
          });
        } else {
          await _syncCollection({
            connectorId,
            intercomClient,
            dataSourceConfig,
            loggerArgs,
            transaction,
            collection: collectionOnIntercom,
            parents: [],
          });
        }
      }
    })
  );
}

/**
 * Deletes a collection and its children (collection & articles) from the database and the core data source.
 */
async function _deleteCollection({
  connectorId,
  dataSourceConfig,
  collection,
  loggerArgs,
  transaction,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  collection: IntercomCollection;
  loggerArgs: Record<string, string | number>;
  transaction: Transaction;
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
      const dsArticleId = getHelpCenterArticleDocumentId(
        article.intercomWorkspaceId,
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
        article.destroy({ transaction }),
      ]);
    })
  );

  // Then we delete the collection
  const dsCollectionId = getHelpCenterCollectionDocumentId(
    collection.intercomWorkspaceId,
    collectionId
  );
  await Promise.all([
    deleteFromDataSource(
      {
        dataSourceName: dataSourceConfig.dataSourceName,
        workspaceId: dataSourceConfig.workspaceId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
      },
      dsCollectionId
    ),
    collection.destroy({ transaction }),
  ]);
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
        transaction,
      });
    })
  );
}

/**
 * Syncs a collection and its children (collection & articles) from the database and the core data source.
 */
async function _syncCollection({
  connectorId,
  intercomClient,
  dataSourceConfig,
  loggerArgs,
  transaction,
  collection,
  parents,
}: {
  connectorId: ModelId;
  intercomClient: IntercomClient;
  dataSourceConfig: DataSourceConfig;
  collection: IntercomCollectionType;
  loggerArgs: Record<string, string | number>;
  transaction: Transaction;
  parents: string[];
}) {
  // Sync the Collection
  let collectionOnDb = await IntercomCollection.findOne({
    where: {
      connectorId,
      collectionId: collection.id,
    },
  });

  if (collectionOnDb) {
    await collectionOnDb.update(
      {
        name: collection.name,
        description: collection.description,
      },
      { transaction }
    );
  } else {
    collectionOnDb = await IntercomCollection.create(
      {
        connectorId: connectorId,
        collectionId: collection.id,
        intercomWorkspaceId: collection.workspace_id,
        helpCenterId: collection.help_center_id,
        parentId: collection.parent_id,
        name: collection.name,
        description: collection.description,
        url: collection.url,
        permission: "read",
      },
      { transaction }
    );
  }

  const collectionContent = await renderDocumentTitleAndContent({
    dataSourceConfig,
    title: collection.name,
    content: { prefix: null, content: collection.description, sections: [] },
    createdAt: new Date(collection.created_at),
    updatedAt: new Date(collection.updated_at),
  });
  const collectionDsDocumentId = getHelpCenterCollectionDocumentId(
    collection.workspace_id,
    collection.id
  );
  await upsertToDatasource({
    dataSourceConfig,
    documentId: collectionDsDocumentId,
    documentContent: collectionContent,
    documentUrl: collection.url,
    timestampMs: collection.updated_at,
    tags: [`name:${collection.name}`, `lastUpdatedAt:${collection.updated_at}`],
    parents,
    retries: 3,
    delayBetweenRetriesMs: 500,
    loggerArgs: {
      ...loggerArgs,
      collectionId: collection.id,
    },
    upsertContext: {
      sync_type: "batch",
    },
  });

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
    if (matchingArticleOnDb) {
      article = await matchingArticleOnDb.update({
        title: articleOnIntercom.title,
        url: articleOnIntercom.url,
      });
    } else {
      article = await IntercomArticle.create({
        connectorId: connectorId,
        articleId: articleOnIntercom.id,
        title: articleOnIntercom.title,
        url: articleOnIntercom.url,
        intercomWorkspaceId: articleOnIntercom.workspace_id,
        authorId: articleOnIntercom.author_id,
        parentId: articleOnIntercom.parent_id,
        parentType:
          articleOnIntercom.parent_type === "collection" ? "collection" : null,
        parents: articleOnIntercom.parent_ids,
        state: articleOnIntercom.state === "published" ? "published" : "draft",
        permission: "read",
      });
    }

    const articleContent = await renderDocumentTitleAndContent({
      dataSourceConfig,
      title: articleOnIntercom.title,
      content: {
        prefix: `TITLE: ${articleOnIntercom.title}`,
        content: articleOnIntercom.body,
        sections: [],
      },
      createdAt: new Date(articleOnIntercom.created_at),
      updatedAt: new Date(articleOnIntercom.updated_at),
    });

    return upsertToDatasource({
      dataSourceConfig,
      documentId: getHelpCenterArticleDocumentId(
        articleOnIntercom.workspace_id,
        articleOnIntercom.id
      ),
      documentContent: articleContent,
      documentUrl: articleOnIntercom.url,
      timestampMs: articleOnIntercom.updated_at,
      tags: [
        `title:${articleOnIntercom.title}`,
        `createdAt:${articleOnIntercom.created_at}`,
        `updatedAt:${articleOnIntercom.updated_at}`,
      ],
      parents: [...parents, collectionDsDocumentId],
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
      await _syncCollection({
        connectorId,
        intercomClient,
        dataSourceConfig,
        loggerArgs,
        transaction,
        collection: collectionOnIntercom,
        parents: [...parents, collectionDsDocumentId],
      });
    })
  );
}
