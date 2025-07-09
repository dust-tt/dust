import {
  getArticleInternalId,
  getCategoryInternalId,
  getTicketInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import { deleteArticle } from "@connectors/connectors/zendesk/lib/sync_article";
import { deleteTicket } from "@connectors/connectors/zendesk/lib/sync_ticket";
import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  fetchZendeskArticle,
  getZendeskBrandSubdomain,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
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
import type { ModelId } from "@connectors/types";
import { getZendeskGarbageCollectionWorkflowId } from "@connectors/types";

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

  const ticketIdsWithBrandIds =
    await ZendeskTicketResource.fetchOutdatedTicketIds({
      connectorId,
      expirationDate: new Date(
        Date.now() - configuration.retentionPeriodDays * 24 * 60 * 60 * 1000 // conversion from days to ms
      ),
      batchSize: ZENDESK_BATCH_SIZE,
    });
  logger.info(
    { ...loggerArgs, ticketCount: ticketIdsWithBrandIds.length },
    "[Zendesk] Removing outdated tickets."
  );

  if (ticketIdsWithBrandIds.length === 0) {
    return { hasMore: false };
  }

  await concurrentExecutor(
    ticketIdsWithBrandIds,
    ({ brandId, ticketId }) =>
      deleteTicket({
        connectorId,
        brandId,
        ticketId,
        dataSourceConfig,
        loggerArgs,
      }),
    { concurrency: 10 }
  );

  return { hasMore: ticketIdsWithBrandIds.length === ZENDESK_BATCH_SIZE }; // true iff there are more tickets to process
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
          brandId,
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
        getTicketInternalId({ connectorId, brandId, ticketId })
      ),
    { concurrency: 10 }
  );
  /// deleting the tickets stored in the db
  await ZendeskTicketResource.deleteByTicketIds({
    connectorId,
    brandId,
    ticketIds,
  });

  /// returning false if we know for sure there isn't any more ticket to process
  return { hasMore: ticketIds.length === ZENDESK_BATCH_SIZE };
}

/**
 * Deletes a batch of categories from connectors (zendesk_categories) and from core (data_sources_folders/nodes) for a brand.
 * Only delete categories that are not explicitly selected by the user and that were synced through their Help Center.
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

  const categoryIds =
    await ZendeskCategoryResource.fetchCategoriesNotSelectedInBrand({
      connectorId,
      brandId,
      batchSize: ZENDESK_BATCH_SIZE,
    });

  for (const categoryId of categoryIds) {
    await deleteDataSourceFolder({
      dataSourceConfig,
      folderId: getCategoryInternalId({ connectorId, brandId, categoryId }),
    });

    const articlesInCategory = await ZendeskArticleResource.fetchByCategoryId({
      categoryId,
      brandId,
      connectorId,
    });

    await concurrentExecutor(
      articlesInCategory,
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
    /// deleting the articles stored in the db
    await ZendeskArticleResource.deleteByArticleIds({
      connectorId,
      brandId,
      articleIds: articlesInCategory.map((a) => a.articleId),
    });
  }

  const deletedCount = await ZendeskCategoryResource.deleteByCategoryIds({
    connectorId,
    brandId,
    categoryIds,
  });
  logger.info(
    { ...loggerArgs, brandId, deletedCount },
    "[Zendesk] Deleting a batch of categories."
  );

  return { hasMore: deletedCount === ZENDESK_BATCH_SIZE };
}
