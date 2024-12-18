import type { ModelId } from "@dust-tt/types";

import {
  getArticleInternalId,
  getBrandInternalId,
  getCategoryInternalId,
  getHelpCenterInternalId,
  getTicketInternalId,
  getTicketsInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import { deleteArticle } from "@connectors/connectors/zendesk/lib/sync_article";
import { deleteCategory } from "@connectors/connectors/zendesk/lib/sync_category";
import { deleteTicket } from "@connectors/connectors/zendesk/lib/sync_ticket";
import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  fetchZendeskArticle,
  getZendeskBrandSubdomain,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
import { getZendeskGarbageCollectionWorkflowId } from "@connectors/connectors/zendesk/temporal/client";
import { ZENDESK_BATCH_SIZE } from "@connectors/connectors/zendesk/temporal/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  deleteDataSourceDocument,
  deleteDataSourceFolder,
} from "@connectors/lib/data_sources";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  ZendeskArticleResource,
  ZendeskBrandResource,
  ZendeskCategoryResource,
  ZendeskConfigurationResource,
  ZendeskTicketResource,
} from "@connectors/resources/zendesk_resources";

/**
 * Looks for empty Help Centers (no category with read permissions) and removes their permissions.
 */
export async function checkEmptyHelpCentersActivity(
  connectorId: ModelId
): Promise<void> {
  const brands =
    await ZendeskBrandResource.fetchHelpCenterReadAllowedBrands(connectorId);

  for (const brand of brands) {
    const categoriesWithReadPermissions =
      await ZendeskCategoryResource.fetchByBrandIdReadOnly({
        connectorId,
        brandId: brand.brandId,
      });
    const noMoreAllowedCategories = categoriesWithReadPermissions.length === 0;
    if (noMoreAllowedCategories) {
      await brand.revokeHelpCenterPermissions();
    }
  }
}

/**
 * Retrieves the IDs of the Brands whose tickets are to be deleted.
 */
export async function getZendeskBrandsWithTicketsToDeleteActivity(
  connectorId: ModelId
): Promise<number[]> {
  return ZendeskBrandResource.fetchTicketsReadForbiddenBrandIds(connectorId);
}

/**
 * Retrieves the IDs of the Brands whose Help Center is to be deleted.
 */
export async function getZendeskBrandsWithHelpCenterToDeleteActivity(
  connectorId: ModelId
): Promise<number[]> {
  return ZendeskBrandResource.fetchHelpCenterReadForbiddenBrandIds(connectorId);
}

/**
 * This activity is responsible for fetching and cleaning up a batch of tickets
 * that are older than the retention period and ready to be deleted.
 */
export async function removeOutdatedTicketBatchActivity(
  connectorId: ModelId
): Promise<{ hasMore: boolean }> {
  const configuration =
    await ZendeskConfigurationResource.fetchByConnectorId(connectorId);
  if (!configuration) {
    throw new Error(
      `[Zendesk] Configuration not found, connectorId: ${connectorId}`
    );
  }
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "zendesk",
    workflowId: getZendeskGarbageCollectionWorkflowId(connectorId),
    dataSourceId: dataSourceConfig.dataSourceId,
  };

  const ticketIds = await ZendeskTicketResource.fetchOutdatedTicketIds({
    connectorId,
    expirationDate: new Date(
      Date.now() - configuration.retentionPeriodDays * 24 * 60 * 60 * 1000 // conversion from days to ms
    ),
    batchSize: ZENDESK_BATCH_SIZE,
  });
  logger.info(
    { ...loggerArgs, ticketCount: ticketIds.length },
    "[Zendesk] Removing outdated tickets."
  );

  if (ticketIds.length === 0) {
    return { hasMore: false };
  }

  await concurrentExecutor(
    ticketIds,
    (ticketId) =>
      deleteTicket({ connectorId, ticketId, dataSourceConfig, loggerArgs }),
    { concurrency: 10 }
  );

  return { hasMore: ticketIds.length === ZENDESK_BATCH_SIZE }; // true iff there are more tickets to process
}

/**
 * This activity is responsible for fetching and garbage collecting a batch of articles.
 * Here, garbage collection means deleting articles that are no longer present in Zendesk.
 */
export async function removeMissingArticleBatchActivity({
  connectorId,
  brandId,
  cursor,
}: {
  connectorId: ModelId;
  brandId: number;
  cursor: number | null;
}): Promise<number | null> {
  const { articleIds, cursor: nextCursor } =
    await ZendeskArticleResource.fetchBatchByBrandId({
      connectorId,
      brandId,
      cursor,
      batchSize: ZENDESK_BATCH_SIZE,
    });

  if (articleIds.length === 0) {
    return null;
  }

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "zendesk",
    workflowId: getZendeskGarbageCollectionWorkflowId(connectorId),
    dataSourceId: dataSourceConfig.dataSourceId,
  };

  const { subdomain, accessToken } = await getZendeskSubdomainAndAccessToken(
    connector.connectionId
  );
  const brandSubdomain = await getZendeskBrandSubdomain({
    connectorId,
    brandId,
    accessToken,
    subdomain,
  });

  // not deleting in batch for now, assuming we won't have that many articles to delete at once
  await concurrentExecutor(
    articleIds,
    async (articleId) => {
      const article = await fetchZendeskArticle({
        brandSubdomain,
        articleId,
        accessToken,
      });
      if (!article) {
        await deleteArticle(
          connectorId,
          articleId,
          dataSourceConfig,
          loggerArgs
        );
      }
    },
    { concurrency: 10 }
  );
  return nextCursor;
}

/**
 * This activity is responsible for removing the categories that have no read permissions.
 */
export async function removeForbiddenCategoriesActivity(
  connectorId: number
): Promise<{ hasMore: boolean }> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "zendesk",
    workflowId: getZendeskGarbageCollectionWorkflowId(connectorId),
    dataSourceId: dataSourceConfig.dataSourceId,
  };

  const batchSize = 2; // we process categories 2 by 2 since each of them typically contains ~50 articles
  const categoryIdsWithBrand =
    await ZendeskCategoryResource.fetchReadForbiddenCategoryIds({
      connectorId,
      batchSize,
    });
  logger.info(
    { ...loggerArgs, categoryCount: categoryIdsWithBrand.length },
    "[Zendesk] Removing categories with no permission."
  );

  for (const ids of categoryIdsWithBrand) {
    await deleteCategory({ connectorId, ...ids, dataSourceConfig });
  }
  return { hasMore: categoryIdsWithBrand.length === batchSize };
}

/**
 * This activity is responsible for removing all the empty categories (category with no readable article).
 */
export async function removeEmptyCategoriesActivity(connectorId: number) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "zendesk",
    workflowId: getZendeskGarbageCollectionWorkflowId(connectorId),
    dataSourceId: dataSourceConfig.dataSourceId,
  };

  const categoryIdsWithBrand =
    await ZendeskCategoryResource.fetchIdsForConnector(connectorId);

  const categoriesToDelete = new Set<{ categoryId: number; brandId: number }>();
  await concurrentExecutor(
    categoryIdsWithBrand,
    async ({ categoryId, brandId }) => {
      const articles = await ZendeskArticleResource.fetchByCategoryIdReadOnly({
        connectorId,
        categoryId,
      });
      if (articles.length === 0) {
        categoriesToDelete.add({ categoryId, brandId });
      }
    },
    { concurrency: 10 }
  );
  logger.info(
    { ...loggerArgs, categoryCount: categoriesToDelete.size },
    "[Zendesk] Removing empty categories."
  );

  for (const ids of categoriesToDelete) {
    await deleteCategory({ connectorId, ...ids, dataSourceConfig });
  }
}

/**
 * This activity is responsible for cleaning up Brands that have no permission anymore.
 */
export async function deleteBrandsWithNoPermissionActivity(
  connectorId: ModelId
): Promise<void> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "zendesk",
    workflowId: getZendeskGarbageCollectionWorkflowId(connectorId),
    dataSourceId: dataSourceConfig.dataSourceId,
  };

  // deleting from data_sources_folders (core)
  const brands =
    await ZendeskBrandResource.fetchBrandsWithNoPermission(connectorId);

  await concurrentExecutor(
    brands,
    async (brandId) => {
      await deleteDataSourceFolder({
        dataSourceConfig,
        folderId: getBrandInternalId({ connectorId, brandId }),
      });
      await deleteDataSourceFolder({
        dataSourceConfig,
        folderId: getHelpCenterInternalId({ connectorId, brandId }),
      });
      await deleteDataSourceFolder({
        dataSourceConfig,
        folderId: getTicketsInternalId({ connectorId, brandId }),
      });
    },
    { concurrency: 10 }
  );

  // deleting from zendesk_brands (connectors)
  const deletedCount =
    await ZendeskBrandResource.deleteBrandsWithNoPermission(connectorId);

  logger.info(
    { ...loggerArgs, deletedCount },
    "[Zendesk] Deleting brands with no permission."
  );
}

/**
 * Deletes a batch of tickets from the db and the data source for a brand.
 */
export async function deleteTicketBatchActivity({
  connectorId,
  brandId,
}: {
  connectorId: number;
  brandId: number;
}): Promise<{ hasMore: boolean }> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "zendesk",
    workflowId: getZendeskGarbageCollectionWorkflowId(connectorId),
    dataSourceId: dataSourceConfig.dataSourceId,
  };

  const ticketIds = await ZendeskTicketResource.fetchTicketIdsByBrandId({
    connectorId,
    brandId,
    batchSize: ZENDESK_BATCH_SIZE,
  });
  logger.info(
    { ...loggerArgs, brandId, ticketCount: ticketIds.length },
    "[Zendesk] Deleting a batch of tickets."
  );

  /// deleting the tickets in the data source
  await concurrentExecutor(
    ticketIds,
    (ticketId) =>
      deleteDataSourceDocument(
        dataSourceConfig,
        getTicketInternalId({ connectorId, ticketId })
      ),
    { concurrency: 10 }
  );
  /// deleting the tickets stored in the db
  await ZendeskTicketResource.deleteByTicketIds({ connectorId, ticketIds });

  /// returning false if we know for sure there isn't any more ticket to process
  return { hasMore: ticketIds.length === ZENDESK_BATCH_SIZE };
}

/**
 * Deletes a batch of articles from the db and the data source for a brand.
 */
export async function deleteArticleBatchActivity({
  connectorId,
  brandId,
}: {
  connectorId: number;
  brandId: number;
}): Promise<{ hasMore: boolean }> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "zendesk",
    workflowId: getZendeskGarbageCollectionWorkflowId(connectorId),
    dataSourceId: dataSourceConfig.dataSourceId,
  };

  /// deleting the articles in the data source
  const articleIds = await ZendeskArticleResource.fetchArticleIdsByBrandId({
    connectorId,
    brandId,
    batchSize: ZENDESK_BATCH_SIZE,
  });
  logger.info(
    { ...loggerArgs, brandId, articleCount: articleIds.length },
    "[Zendesk] Deleting a batch of articles."
  );

  await concurrentExecutor(
    articleIds,
    (articleId) =>
      deleteDataSourceDocument(
        dataSourceConfig,
        getArticleInternalId({ connectorId, articleId })
      ),
    { concurrency: 10 }
  );
  /// deleting the articles stored in the db
  await ZendeskArticleResource.deleteByArticleIds({ connectorId, articleIds });

  /// returning false if we know for sure there isn't any more article to process
  return { hasMore: articleIds.length === ZENDESK_BATCH_SIZE };
}

/**
 * Deletes a batch of categories from the db.
 */
export async function deleteCategoryBatchActivity({
  connectorId,
  brandId,
}: {
  connectorId: number;
  brandId: number;
}): Promise<{ hasMore: boolean }> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "zendesk",
    workflowId: getZendeskGarbageCollectionWorkflowId(connectorId),
    dataSourceId: dataSourceConfig.dataSourceId,
  };

  const categories = await ZendeskCategoryResource.fetchByBrandId({
    connectorId,
    brandId,
    batchSize: ZENDESK_BATCH_SIZE,
  });

  await concurrentExecutor(
    categories,
    async ({ categoryId, brandId }) => {
      await deleteDataSourceFolder({
        dataSourceConfig,
        folderId: getCategoryInternalId({ connectorId, brandId, categoryId }),
      });
    },
    { concurrency: 10 }
  );

  const deletedCount = await ZendeskCategoryResource.deleteByCategoryIds({
    connectorId,
    categoryIds: categories.map((category) => category.categoryId),
  });
  logger.info(
    { ...loggerArgs, brandId, deletedCount },
    "[Zendesk] Deleting a batch of categories."
  );

  return { hasMore: deletedCount === ZENDESK_BATCH_SIZE };
}
