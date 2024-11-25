import type { ModelId } from "@dust-tt/types";

import {
  getArticleInternalId,
  getTicketInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import { deleteArticle } from "@connectors/connectors/zendesk/lib/sync_article";
import { deleteCategory } from "@connectors/connectors/zendesk/lib/sync_category";
import { deleteTicket } from "@connectors/connectors/zendesk/lib/sync_ticket";
import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  changeZendeskClientSubdomain,
  createZendeskClient,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
import { ZENDESK_BATCH_SIZE } from "@connectors/connectors/zendesk/temporal/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { deleteFromDataSource } from "@connectors/lib/data_sources";
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
  const ticketIds = await ZendeskTicketResource.fetchOutdatedTicketIds({
    connectorId,
    expirationDate: new Date(
      Date.now() - configuration.retentionPeriodDays * 24 * 60 * 60 * 1000 // conversion from days to ms
    ),
    batchSize: ZENDESK_BATCH_SIZE,
  });

  if (ticketIds.length === 0) {
    return { hasMore: false };
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
    dataSourceId: dataSourceConfig.dataSourceId,
  };

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
    dataSourceId: dataSourceConfig.dataSourceId,
  };

  const zendeskApiClient = createZendeskClient(
    await getZendeskSubdomainAndAccessToken(connector.connectionId)
  );
  await changeZendeskClientSubdomain(zendeskApiClient, {
    connectorId,
    brandId,
  });

  // not deleting in batch for now, assuming we won't have that many articles to delete at once
  await concurrentExecutor(
    articleIds,
    async (articleId) => {
      const article =
        await zendeskApiClient.helpcenter.articles.show(articleId);
      if (!article) {
        await deleteArticle(connectorId, article, dataSourceConfig, loggerArgs);
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

  const batchSize = 2; // we process categories 2 by 2 since each of them typically contains ~50 articles
  const categoryIds =
    await ZendeskCategoryResource.fetchReadForbiddenCategoryIds({
      connectorId,
      batchSize,
    });
  for (const categoryId of categoryIds) {
    await deleteCategory({ connectorId, categoryId, dataSourceConfig });
  }
  return { hasMore: categoryIds.length === batchSize };
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

  const categoryIds = (
    await ZendeskCategoryResource.fetchIdsForConnector(connectorId)
  ).map(({ categoryId }) => categoryId);

  const categoriesToDelete = new Set<number>();
  await concurrentExecutor(
    categoryIds,
    async (categoryId) => {
      const articles = await ZendeskArticleResource.fetchByCategoryIdReadOnly({
        connectorId,
        categoryId,
      });
      if (articles.length === 0) {
        categoriesToDelete.add(categoryId);
      }
    },
    { concurrency: 10 }
  );
  for (const categoryId of categoriesToDelete) {
    await deleteCategory({ connectorId, categoryId, dataSourceConfig });
  }
}

/**
 * This activity is responsible for cleaning up Brands that have no permission anymore.
 */
export async function deleteBrandsWithNoPermissionActivity(
  connectorId: ModelId
): Promise<void> {
  await ZendeskBrandResource.deleteBrandsWithNoPermission(connectorId);
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

  const ticketIds = await ZendeskTicketResource.fetchTicketIdsByBrandId({
    connectorId,
    brandId,
    batchSize: ZENDESK_BATCH_SIZE,
  });
  /// deleting the tickets in the data source
  await concurrentExecutor(
    ticketIds,
    (ticketId) =>
      deleteFromDataSource(
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

  /// deleting the articles in the data source
  const articleIds = await ZendeskArticleResource.fetchArticleIdsByBrandId({
    connectorId,
    brandId,
    batchSize: ZENDESK_BATCH_SIZE,
  });
  await concurrentExecutor(
    articleIds,
    (articleId) =>
      deleteFromDataSource(
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
  const deletedCount = await ZendeskCategoryResource.deleteByBrandId({
    connectorId,
    brandId,
    batchSize: ZENDESK_BATCH_SIZE,
  });

  return { hasMore: deletedCount === ZENDESK_BATCH_SIZE };
}
