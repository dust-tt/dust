import { ModelId } from "@dust-tt/types";
import { Client as IntercomClient } from "intercom-client";
import { Transaction } from "sequelize";

import {
  fetchIntercomArticles,
  fetchIntercomCollection,
  fetchIntercomCollections,
  IntercomCollectionType,
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
import {
  IntercomArticle,
  IntercomCollection,
  IntercomHelpCenter,
} from "@connectors/lib/models/intercom";
import { DataSourceConfig } from "@connectors/types/data_source_config";

/**
 * This function will loop on all the collections attached to a help Center
 * And delete the objects in Connector database and in the Core data sources.
 */
export async function removeHelpCenterFromDbAndCore({
  dataSourceConfig,
  helpCenter,
  transaction,
}: {
  dataSourceConfig: DataSourceConfig;
  helpCenter: IntercomHelpCenter;
  transaction: Transaction;
}) {
  const collections = await IntercomCollection.findAll({
    where: {
      helpCenterId: helpCenter.helpCenterId,
    },
  });

  await Promise.all(
    collections.map(async (collection) => {
      await _deleteCollectionFromDbAndCore({
        dataSourceConfig,
        collection,
        transaction,
      });
    })
  );
}

/**
 * Deletes a collection and its children (collection & articles) from the database and the core data source.
 */
async function _deleteCollectionFromDbAndCore({
  dataSourceConfig,
  collection,
  transaction,
}: {
  dataSourceConfig: DataSourceConfig;
  collection: IntercomCollection;
  transaction: Transaction;
}) {
  // We delete all articles in the collection
  const articles = await IntercomArticle.findAll({
    where: {
      parentId: collection.collectionId,
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
    collection.collectionId
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
}

/**
 * This function will loop on all the level 1 collections attached to a help Center
 * If our permission is none or of the collection is not on Intercom anymore, we delete the collection from the database and the core data source.
 * It our permission is read and the collection is on Intercom, we sync the collection and its children = we upsert them in the database and the core data source.
 */
export async function syncHelpCenterInDbAndCore({
  connectorId,
  intercomClient,
  dataSourceConfig,
  helpCenter,
  loggerArgs,
  transaction,
}: {
  connectorId: ModelId;
  intercomClient: IntercomClient;
  dataSourceConfig: DataSourceConfig;
  helpCenter: IntercomHelpCenter;
  loggerArgs: Record<string, string | number>;
  transaction: Transaction;
}) {
  const level1Collections = await IntercomCollection.findAll({
    where: {
      helpCenterId: helpCenter.helpCenterId,
      parentId: null,
    },
  });

  await Promise.all(
    level1Collections.map(async (collection) => {
      const collectionOnIntercom = await fetchIntercomCollection(
        intercomClient,
        collection.collectionId
      );
      if (collection.permission === "none" || !collectionOnIntercom) {
        await _deleteCollectionFromDbAndCore({
          dataSourceConfig,
          collection,
          transaction,
        });
      } else {
        await _syncHelpCenterCollection({
          connectorId,
          intercomClient,
          dataSourceConfig,
          loggerArgs,
          transaction,
          collection: collectionOnIntercom,
          parents: [],
        });
      }
    })
  );
}

/**
 * Syncs a collection and its children (collection & articles) from the database and the core data source.
 */
async function _syncHelpCenterCollection({
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
  const collectionDsDocumentId = getHelpCenterCollectionDocumentId(
    collection.workspace_id,
    collection.id
  );

  let collectionOnDb = await IntercomCollection.findOne({
    where: {
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

  const collectionContent = renderDocumentTitleAndContent({
    title: collection.name,
    content: { prefix: null, content: collection.description, sections: [] },
    createdAt: new Date(collection.created_at),
    updatedAt: new Date(collection.updated_at),
  });
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
      sync_type: "incremental", // @todo daph should be isInitialSync ? "batch" : "incremental",
    },
  });

  const childrenArticlesOnIntercom = await fetchIntercomArticles(
    intercomClient,
    collection.id
  );
  const childrenArticlesOnDb = await IntercomArticle.findAll({
    where: {
      parentId: collection.id,
    },
  });
  childrenArticlesOnIntercom.map(async (articleOnIntercom) => {
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

    const articleContent = renderDocumentTitleAndContent({
      title: articleOnIntercom.title,
      content: {
        prefix: `TITLE: ${articleOnIntercom.title}`,
        content: articleOnIntercom.body,
        sections: [],
      },
      createdAt: new Date(articleOnIntercom.created_at),
      updatedAt: new Date(articleOnIntercom.updated_at),
    });
    await upsertToDatasource({
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
      parents:
        articleOnIntercom.parent_id &&
        articleOnIntercom.parent_type === "collection"
          ? [...parents, collectionDsDocumentId]
          : parents,
      retries: 3,
      delayBetweenRetriesMs: 500,
      loggerArgs: {
        ...loggerArgs,
        articleId: article.id,
      },
      upsertContext: {
        sync_type: "incremental", // @todo daph should be isInitialSync ? "batch" : "incremental",
      },
    });
  });

  const childrenCollectionsOnIntercom = await fetchIntercomCollections(
    intercomClient,
    collection.help_center_id,
    collection.id
  );

  await Promise.all(
    childrenCollectionsOnIntercom.map(async (collectionOnIntercom) => {
      await _syncHelpCenterCollection({
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
