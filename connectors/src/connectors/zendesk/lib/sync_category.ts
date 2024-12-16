import type { ModelId } from "@dust-tt/types";

import type { ZendeskFetchedCategory } from "@connectors/@types/node-zendesk";
import {
  getArticleInternalId,
  getCategoryInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  deleteFolderNode,
  deleteFromDataSource,
} from "@connectors/lib/data_sources";
import {
  ZendeskArticleResource,
  ZendeskCategoryResource,
} from "@connectors/resources/zendesk_resources";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

/**
 * Deletes all the data stored in the db and in the data source relative to a category (articles).
 */
export async function deleteCategory({
  connectorId,
  categoryId,
  brandId,
  dataSourceConfig,
}: {
  connectorId: number;
  categoryId: number;
  brandId: number;
  dataSourceConfig: DataSourceConfig;
}) {
  // deleting the articles in the data source
  const articles = await ZendeskArticleResource.fetchByCategoryId({
    connectorId,
    categoryId,
  });
  await concurrentExecutor(
    articles,
    (article) =>
      deleteFromDataSource(
        dataSourceConfig,
        getArticleInternalId({ connectorId, articleId: article.articleId })
      ),
    { concurrency: 10 }
  );
  // deleting the articles stored in the db
  await ZendeskArticleResource.deleteByCategoryId({
    connectorId,
    categoryId,
  });
  // deleting the folder in data_sources_folders (core)
  const folderId = getCategoryInternalId({ connectorId, brandId, categoryId });
  await deleteFolderNode({ dataSourceConfig, folderId });
  // deleting the category stored in the db
  await ZendeskCategoryResource.deleteByCategoryId({ connectorId, categoryId });
}

/**
 * Syncs a category from Zendesk to the postgres db.
 */
export async function syncCategory({
  connectorId,
  brandId,
  category,
  currentSyncDateMs,
}: {
  connectorId: ModelId;
  brandId: number;
  category: ZendeskFetchedCategory;
  currentSyncDateMs: number;
}): Promise<void> {
  const categoryInDb = await ZendeskCategoryResource.fetchByCategoryId({
    connectorId,
    categoryId: category.id,
  });
  if (!categoryInDb) {
    await ZendeskCategoryResource.makeNew({
      blob: {
        name: category.name || "Category",
        url: category.html_url,
        description: category.description,
        lastUpsertedTs: new Date(currentSyncDateMs),
        connectorId,
        brandId,
        categoryId: category.id,
        permission: "read",
      },
    });
  } else {
    await categoryInDb.update({
      name: category.name || "Category",
      url: category.html_url,
      description: category.description,
      lastUpsertedTs: new Date(currentSyncDateMs),
    });
  }
}
