import {
  getArticleInternalId,
  getCategoryInternalId,
  getHelpCenterInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import type { ZendeskFetchedCategory } from "@connectors/connectors/zendesk/lib/types";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  deleteDataSourceDocument,
  deleteDataSourceFolder,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import {
  ZendeskArticleResource,
  ZendeskCategoryResource,
} from "@connectors/resources/zendesk_resources";
import type { DataSourceConfig, ModelId } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

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
    brandId,
    categoryId,
  });
  await concurrentExecutor(
    articles,
    (article) =>
      deleteDataSourceDocument(
        dataSourceConfig,
        getArticleInternalId({
          connectorId,
          brandId,
          articleId: article.articleId,
        })
      ),
    { concurrency: 10 }
  );
  // deleting the articles stored in the db
  await ZendeskArticleResource.deleteByCategoryId({
    connectorId,
    brandId,
    categoryId,
  });
  // deleting the folder in data_sources_folders (core)
  const folderId = getCategoryInternalId({ connectorId, brandId, categoryId });
  await deleteDataSourceFolder({ dataSourceConfig, folderId });
  // deleting the category stored in the db
  await ZendeskCategoryResource.deleteByCategoryId({
    connectorId,
    brandId,
    categoryId,
  });
}

/**
 * Syncs a category from Zendesk with both connectors (zendesk_categories) and core (data_sources_folders/nodes).
 */
export async function syncCategory({
  connectorId,
  brandId,
  category,
  isHelpCenterSelected,
  currentSyncDateMs,
  dataSourceConfig,
}: {
  connectorId: ModelId;
  brandId: number;
  category: ZendeskFetchedCategory;
  isHelpCenterSelected: boolean;
  currentSyncDateMs: number;
  dataSourceConfig: DataSourceConfig;
}): Promise<void> {
  let categoryInDb = await ZendeskCategoryResource.fetchByCategoryId({
    connectorId,
    brandId,
    categoryId: category.id,
  });
  if (!categoryInDb) {
    categoryInDb = await ZendeskCategoryResource.makeNew({
      blob: {
        name: category.name || "Category",
        url: category.html_url,
        description: category.description,
        lastUpsertedTs: new Date(currentSyncDateMs),
        connectorId,
        brandId,
        categoryId: category.id,
        permission: "none",
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

  // upserting a folder to data_sources_folders (core)
  const folderId = getCategoryInternalId({
    connectorId,
    brandId,
    categoryId: categoryInDb.categoryId,
  });
  // adding the parents to the array of parents iff the Help Center was selected
  const parentId = isHelpCenterSelected
    ? getHelpCenterInternalId({ connectorId, brandId })
    : null;
  const parents = parentId ? [folderId, parentId] : [folderId];

  await upsertDataSourceFolder({
    dataSourceConfig,
    folderId,
    parents,
    parentId: parentId,
    title: category.name,
    mimeType: INTERNAL_MIME_TYPES.ZENDESK.CATEGORY,
    sourceUrl: category.html_url,
    timestampMs: currentSyncDateMs,
  });
}
