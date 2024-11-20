import type { ModelId } from "@dust-tt/types";

import { deleteCategory } from "@connectors/connectors/zendesk/lib/data_cleanup";
import {
  getArticleInternalId,
  getTicketInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import { deleteArticle } from "@connectors/connectors/zendesk/lib/sync_article";
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
  const brands = await ZendeskBrandResource.fetchHelpCenterReadAllowedBrands({
    connectorId,
  });

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
  return ZendeskBrandResource.fetchTicketsReadForbiddenBrandIds({
    connectorId,
  });
}

/**
 * Retrieves the IDs of the Brands whose Help Center is to be deleted.
 */
export async function getZendeskBrandsWithHelpCenterToDeleteActivity(
  connectorId: ModelId
): Promise<number[]> {
  return ZendeskBrandResource.fetchHelpCenterReadForbiddenBrandIds({
    connectorId,
  });
}

/**
 * This activity is responsible for fetching and cleaning up a batch of tickets
 * that are older than the retention period and ready to be deleted.
 */
export async function removeOutdatedTicketBatchActivity(
  connectorId: ModelId
): Promise<boolean> {
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
    return false;
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

  return ticketIds.length === ZENDESK_BATCH_SIZE; // true iff there are more tickets to process
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
 * This activity is responsible for removing all the empty categories (category with no readable article).
 */
export async function removeEmptyCategoriesActivity(connectorId: number) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const categoryIds =
    await ZendeskCategoryResource.fetchCategoryIdsForConnector(connectorId);

  await concurrentExecutor(
    categoryIds,
    async (categoryId) => {
      const articles = await ZendeskArticleResource.fetchByCategoryIdReadOnly({
        connectorId,
        categoryId,
      });
      if (articles.length === 0) {
        await deleteCategory({ connectorId, categoryId, dataSourceConfig });
      }
    },
    { concurrency: 10 }
  );
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
 *
 * @returns `false` if there is no more ticket to process.
 */
export async function deleteTicketBatchActivity({
  connectorId,
  brandId,
}: {
  connectorId: number;
  brandId: number;
}): Promise<boolean> {
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
        getTicketInternalId(connectorId, ticketId)
      ),
    { concurrency: 10 }
  );
  /// deleting the tickets stored in the db
  await ZendeskTicketResource.deleteByTicketIds({ connectorId, ticketIds });

  /// returning false if we know for sure there isn't any more ticket to process
  return ticketIds.length === ZENDESK_BATCH_SIZE;
}

/**
 * Deletes a batch of articles from the db and the data source for a brand.
 *
 * @returns `false` if there is no more article to process.
 */
export async function deleteArticleBatchActivity({
  connectorId,
  brandId,
}: {
  connectorId: number;
  brandId: number;
}): Promise<boolean> {
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
        getArticleInternalId(connectorId, articleId)
      ),
    { concurrency: 10 }
  );
  /// deleting the articles stored in the db
  await ZendeskArticleResource.deleteByArticleIds({ connectorId, articleIds });

  /// returning false if we know for sure there isn't any more article to process
  return articleIds.length === ZENDESK_BATCH_SIZE;
}

/**
 * Deletes a batch of categories from the db.
 *
 * @returns `false` if there is no more category to process.
 */
export async function deleteCategoryBatchActivity({
  connectorId,
  brandId,
}: {
  connectorId: number;
  brandId: number;
}): Promise<boolean> {
  const deletedCount = await ZendeskCategoryResource.deleteByBrandId({
    connectorId,
    brandId,
    batchSize: ZENDESK_BATCH_SIZE,
  });

  return deletedCount === ZENDESK_BATCH_SIZE;
}
