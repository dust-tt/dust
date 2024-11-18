import type { ModelId } from "@dust-tt/types";

import {
  getArticleInternalId,
  getTicketInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import { syncArticle } from "@connectors/connectors/zendesk/lib/sync_article";
import {
  deleteTicket,
  syncTicket,
} from "@connectors/connectors/zendesk/lib/sync_ticket";
import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  changeZendeskClientSubdomain,
  createZendeskClient,
  fetchRecentlyUpdatedArticles,
  fetchRecentlyUpdatedTickets,
  fetchSolvedZendeskTicketsInBrand,
  fetchZendeskArticlesInCategory,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { deleteFromDataSource } from "@connectors/lib/data_sources";
import { ZendeskTimestampCursors } from "@connectors/lib/models/zendesk";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  ZendeskArticleResource,
  ZendeskBrandResource,
  ZendeskCategoryResource,
  ZendeskTicketResource,
} from "@connectors/resources/zendesk_resources";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const ZENDESK_BATCH_SIZE = 100;

/**
 * This activity is responsible for updating the lastSyncStartTime of the connector to now.
 */
export async function saveZendeskConnectorStartSync({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }
  const res = await syncStarted(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

/**
 * This activity is responsible for updating the sync status of the connector to "success".
 */
export async function saveZendeskConnectorSuccessSync({
  connectorId,
  currentSyncDateMs,
}: {
  connectorId: ModelId;
  currentSyncDateMs: number;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }
  const cursors = await ZendeskTimestampCursors.findOne({
    where: { connectorId },
  });
  if (!cursors) {
    // can be missing if the first sync was not within an incremental workflow
    await ZendeskTimestampCursors.create({
      connectorId,
      timestampCursor: new Date(currentSyncDateMs), // setting this as the start date of the sync (last successful sync)
    });
  } else {
    await cursors.update({
      timestampCursor: new Date(currentSyncDateMs), // setting this as the start date of the sync (last successful sync)
    });
  }
  const res = await syncSucceeded(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

/**
 * This activity is responsible for syncing a Brand.
 * It does not sync the content inside the Brand, only the Brand data in itself.
 *
 * It is going to update the name of the Brand if it has changed.
 * If the Brand is not allowed anymore, it will delete all its data.
 * If the Brand is not present on Zendesk anymore, it will delete all its data as well.
 * If the Help Center has no readable category anymore, we delete the Help Center data.
 *
 * @returns the updated permissions of the Brand.
 */
export async function syncZendeskBrandActivity({
  connectorId,
  brandId,
  currentSyncDateMs,
}: {
  connectorId: ModelId;
  brandId: number;
  currentSyncDateMs: number;
}): Promise<{ helpCenterAllowed: boolean; ticketsAllowed: boolean }> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const brandInDb = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });
  if (!brandInDb) {
    throw new Error(
      `[Zendesk] Brand not found, connectorId: ${connectorId}, brandId: ${brandId}`
    );
  }

  // deleting the tickets/help center if not allowed anymore
  if (brandInDb.ticketsPermission === "none") {
    await deleteBrandTickets({ connectorId, brandId, dataSourceConfig });
  }
  if (brandInDb.helpCenterPermission === "none") {
    await deleteBrandHelpCenter({ connectorId, brandId, dataSourceConfig });
  }

  // if all rights were revoked, we delete the brand data.
  if (
    brandInDb.helpCenterPermission === "none" &&
    brandInDb.ticketsPermission === "none"
  ) {
    await brandInDb.delete();
    return { helpCenterAllowed: false, ticketsAllowed: false };
  }

  // if the brand is not on Zendesk anymore, we delete it
  const zendeskApiClient = createZendeskClient(
    await getZendeskSubdomainAndAccessToken(connector.connectionId)
  );
  const {
    result: { brand: fetchedBrand },
  } = await zendeskApiClient.brand.show(brandId);
  if (!fetchedBrand) {
    await Promise.all([
      deleteBrandHelpCenter({ connectorId, brandId, dataSourceConfig }),
      deleteBrandTickets({ connectorId, brandId, dataSourceConfig }),
    ]);
    await brandInDb.delete();
    return { helpCenterAllowed: false, ticketsAllowed: false };
  }

  // if there are no read permissions on any category, we delete the help center
  const categoriesWithReadPermissions =
    await ZendeskCategoryResource.fetchByBrandIdReadOnly({
      connectorId,
      brandId,
    });
  const noMoreAllowedCategories = categoriesWithReadPermissions.length === 0;

  if (noMoreAllowedCategories) {
    await deleteBrandHelpCenter({ connectorId, brandId, dataSourceConfig });
    // if the tickets and all children categories are not allowed anymore, we delete the brand data
    if (brandInDb.ticketsPermission !== "read") {
      await brandInDb.delete();
      return { helpCenterAllowed: false, ticketsAllowed: false };
    }
    await brandInDb.revokeHelpCenterPermissions();
  }

  // otherwise, we update the brand name and lastUpsertedTs
  await brandInDb.update({
    name: fetchedBrand.name || "Brand",
    lastUpsertedTs: new Date(currentSyncDateMs),
  });
  return {
    helpCenterAllowed: brandInDb.helpCenterPermission === "read",
    ticketsAllowed: brandInDb.ticketsPermission === "read",
  };
}

/**
 * Retrieves the timestamp cursor, which is the start date of the last successful sync.
 */
export async function getZendeskTimestampCursorActivity(
  connectorId: ModelId
): Promise<Date | null> {
  let cursors = await ZendeskTimestampCursors.findOne({
    where: { connectorId },
  });
  if (!cursors) {
    cursors = await ZendeskTimestampCursors.create({
      connectorId,
      timestampCursor: null, // start date of the last successful sync, null for now since we do not know it will succeed
    });
  }
  // we get a StartTimeTooRecent error before 1 minute
  const minAgo = Date.now() - 60 * 1000; // 1 minute ago
  return cursors.timestampCursor
    ? new Date(Math.min(cursors.timestampCursor.getTime(), minAgo))
    : new Date(minAgo);
}

/**
 * Retrieves the IDs of every brand stored in db that has read permissions on their Help Center.
 */
export async function getZendeskHelpCenterReadAllowedBrandIdsActivity(
  connectorId: ModelId
): Promise<number[]> {
  return ZendeskBrandResource.fetchHelpCenterReadAllowedBrandIds({
    connectorId,
  });
}

/**
 * Retrieves the IDs of every brand stored in db that has read permissions on their Tickets.
 */
export async function getZendeskTicketsAllowedBrandIdsActivity(
  connectorId: ModelId
): Promise<number[]> {
  return ZendeskBrandResource.fetchTicketsAllowedBrandIds({
    connectorId,
  });
}

/**
 * Retrieves the categories for a given Brand.
 */
export async function getZendeskCategoriesActivity({
  connectorId,
  brandId,
}: {
  connectorId: ModelId;
  brandId: number;
}): Promise<number[]> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }
  const client = createZendeskClient(
    await getZendeskSubdomainAndAccessToken(connector.connectionId)
  );
  await changeZendeskClientSubdomain(client, { connectorId, brandId });
  const categories = await client.helpcenter.categories.list();

  return categories.map((category) => category.id);
}

/**
 * This activity is responsible for syncing a Category.
 * It does not sync the articles inside the Category, only the Category data in itself.
 *
 * It is going to update the name of the Category if it has changed.
 * If the Category is not allowed anymore, it will delete all its data.
 * If the Category is not present on Zendesk anymore, it will delete all its data as well.
 *
 * @returns true if the Category was updated, false if it was deleted.
 */
export async function syncZendeskCategoryActivity({
  connectorId,
  categoryId,
  brandId,
  currentSyncDateMs,
}: {
  connectorId: ModelId;
  categoryId: number;
  brandId: number;
  currentSyncDateMs: number;
}): Promise<boolean> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const categoryInDb = await ZendeskCategoryResource.fetchByCategoryId({
    connectorId,
    categoryId,
  });
  if (!categoryInDb) {
    throw new Error(
      `[Zendesk] Category not found, connectorId: ${connectorId}, categoryId: ${categoryId}`
    );
  }

  // if all rights were revoked, we delete the category data.
  if (categoryInDb.permission === "none") {
    await deleteCategoryChildren({ connectorId, dataSourceConfig, categoryId });
    await categoryInDb.delete();
    return false;
  }

  const zendeskApiClient = createZendeskClient(
    await getZendeskSubdomainAndAccessToken(connector.connectionId)
  );
  await changeZendeskClientSubdomain(zendeskApiClient, {
    connectorId,
    brandId,
  });

  // if the category is not on Zendesk anymore, we delete it
  const { result: fetchedCategory } =
    await zendeskApiClient.helpcenter.categories.show(categoryId);
  if (!fetchedCategory) {
    await deleteCategoryChildren({ connectorId, categoryId, dataSourceConfig });
    await categoryInDb.delete();
    return false;
  }

  // otherwise, we update the category name and lastUpsertedTs
  await categoryInDb.update({
    name: fetchedCategory.name || "Category",
    lastUpsertedTs: new Date(currentSyncDateMs),
  });
  return true;
}

/**
 * This activity is responsible for syncing the next batch of articles to process.
 * It does not sync the Category, only the Articles.
 */
export async function syncZendeskArticleBatchActivity({
  connectorId,
  categoryId,
  currentSyncDateMs,
  forceResync,
  cursor,
}: {
  connectorId: ModelId;
  categoryId: number;
  currentSyncDateMs: number;
  forceResync: boolean;
  cursor: string | null;
}): Promise<{ hasMore: boolean; afterCursor: string | null }> {
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
  const category = await ZendeskCategoryResource.fetchByCategoryId({
    connectorId,
    categoryId,
  });
  if (!category) {
    throw new Error(
      `[Zendesk] Category not found, connectorId: ${connectorId}, categoryId: ${categoryId}`
    );
  }

  const { accessToken, subdomain } = await getZendeskSubdomainAndAccessToken(
    connector.connectionId
  );
  const zendeskApiClient = createZendeskClient({ accessToken, subdomain });
  const brandSubdomain = await changeZendeskClientSubdomain(zendeskApiClient, {
    brandId: category.brandId,
    connectorId,
  });

  const {
    articles,
    meta: { after_cursor, has_more },
  } = await fetchZendeskArticlesInCategory({
    subdomain: brandSubdomain,
    accessToken,
    categoryId: category.categoryId,
    pageSize: ZENDESK_BATCH_SIZE,
    cursor,
  });

  const sections = await zendeskApiClient.helpcenter.sections.list();
  const users = await zendeskApiClient.users.list();

  await concurrentExecutor(
    articles,
    (article) =>
      syncArticle({
        connectorId,
        category,
        article,
        section:
          sections.find((section) => section.id === article.section_id) || null,
        user: users.find((user) => user.id === article.author_id) || null,
        dataSourceConfig,
        currentSyncDateMs,
        loggerArgs,
        forceResync,
      }),
    { concurrency: 10 }
  );
  return { hasMore: has_more, afterCursor: after_cursor };
}

/**
 * This activity is responsible for syncing the next batch of tickets to process.
 */
export async function syncZendeskTicketBatchActivity({
  connectorId,
  brandId,
  currentSyncDateMs,
  forceResync,
  cursor,
}: {
  connectorId: ModelId;
  brandId: number;
  currentSyncDateMs: number;
  forceResync: boolean;
  cursor: string | null;
}): Promise<{ hasMore: boolean; afterCursor: string }> {
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

  const { subdomain, accessToken } = await getZendeskSubdomainAndAccessToken(
    connector.connectionId
  );
  const zendeskApiClient = createZendeskClient({ subdomain, accessToken });
  const brandSubdomain = await changeZendeskClientSubdomain(zendeskApiClient, {
    connectorId,
    brandId,
  });

  const { tickets, meta } = await fetchSolvedZendeskTicketsInBrand({
    brandSubdomain,
    accessToken,
    pageSize: ZENDESK_BATCH_SIZE,
    cursor,
  });

  if (tickets.length === 0) {
    logger.info(
      { ...loggerArgs, ticketsSynced: 0 },
      `[Zendesk] No tickets to process in batch - stopping.`
    );
    return { hasMore: false, afterCursor: "" };
  }

  const users = await zendeskApiClient.users.list();

  const res = await concurrentExecutor(
    tickets,
    async (ticket) => {
      const comments = await zendeskApiClient.tickets.getComments(ticket.id);

      return syncTicket({
        connectorId,
        brandId,
        ticket,
        dataSourceConfig,
        currentSyncDateMs,
        loggerArgs,
        forceResync,
        comments,
        users,
      });
    },
    { concurrency: 10 }
  );

  logger.info(
    { ...loggerArgs, ticketsSynced: res.filter((r) => r).length },
    `[Zendesk] Processing ${res.length} tickets in batch`
  );

  return {
    afterCursor: meta.after_cursor,
    hasMore: meta.has_more,
  };
}

/**
 * This activity is responsible for syncing the next batch of recently updated articles to process.
 * It is based on the incremental endpoint, which returns a diff.
 * @returns The next start time if there is any more data to fetch, null otherwise.
 */
export async function syncZendeskArticleUpdateBatchActivity({
  connectorId,
  brandId,
  currentSyncDateMs,
  startTime,
}: {
  connectorId: ModelId;
  brandId: number;
  currentSyncDateMs: number;
  startTime: number;
}): Promise<number | null> {
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

  const { accessToken, subdomain } = await getZendeskSubdomainAndAccessToken(
    connector.connectionId
  );
  const zendeskApiClient = createZendeskClient({ accessToken, subdomain });
  const brandSubdomain = await changeZendeskClientSubdomain(zendeskApiClient, {
    connectorId,
    brandId,
  });

  const { articles, end_time, next_page } = await fetchRecentlyUpdatedArticles({
    subdomain: brandSubdomain,
    accessToken,
    startTime,
  });

  await concurrentExecutor(
    articles,
    async (article) => {
      const { result: section } =
        await zendeskApiClient.helpcenter.sections.show(article.section_id);
      const { result: user } = await zendeskApiClient.users.show(
        article.author_id
      );

      if (section.category_id) {
        const category = await ZendeskCategoryResource.fetchByCategoryId({
          connectorId,
          categoryId: section.category_id,
        });
        if (category && category.permission === "read") {
          return syncArticle({
            connectorId,
            category,
            article,
            section,
            user,
            dataSourceConfig,
            currentSyncDateMs,
            loggerArgs,
            forceResync: false,
          });
        }
      }
    },
    { concurrency: 10 }
  );
  return next_page !== null ? end_time : null;
}

/**
 * This activity is responsible for syncing the next batch of recently updated tickets to process.
 * It is based on the incremental endpoint, which returns a diff.
 */
export async function syncZendeskTicketUpdateBatchActivity({
  connectorId,
  brandId,
  startTime,
  currentSyncDateMs,
  cursor,
}: {
  connectorId: ModelId;
  brandId: number;
  startTime: number;
  currentSyncDateMs: number;
  cursor: string | null;
}): Promise<{ hasMore: boolean; afterCursor: string | null }> {
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

  const { accessToken, subdomain } = await getZendeskSubdomainAndAccessToken(
    connector.connectionId
  );
  const zendeskApiClient = createZendeskClient({ accessToken, subdomain });
  const brandSubdomain = await changeZendeskClientSubdomain(zendeskApiClient, {
    connectorId,
    brandId,
  });

  const { tickets, after_cursor, end_of_stream } =
    await fetchRecentlyUpdatedTickets({
      subdomain: brandSubdomain,
      accessToken,
      ...(cursor ? { cursor } : { startTime }),
    });

  await concurrentExecutor(
    tickets,
    async (ticket) => {
      if (ticket.status === "deleted") {
        return deleteTicket(connectorId, ticket, dataSourceConfig, loggerArgs);
      } else if (ticket.status === "solved") {
        const comments = await zendeskApiClient.tickets.getComments(ticket.id);
        const { result: users } = await zendeskApiClient.users.showMany(
          comments.map((c) => c.author_id)
        );
        return syncTicket({
          connectorId,
          ticket,
          brandId,
          users,
          comments,
          dataSourceConfig,
          currentSyncDateMs,
          loggerArgs,
          forceResync: false,
        });
      }
    },
    { concurrency: 10 }
  );
  return { hasMore: !end_of_stream, afterCursor: after_cursor };
}

/**
 * Deletes all the tickets stored in the db and in the data source relative to a brand.
 */
async function deleteBrandTickets({
  connectorId,
  brandId,
  dataSourceConfig,
}: {
  connectorId: number;
  brandId: number;
  dataSourceConfig: DataSourceConfig;
}) {
  const tickets = await ZendeskTicketResource.fetchByBrandId({
    connectorId,
    brandId,
  });
  /// deleting the tickets in the data source
  await Promise.all(
    tickets.map((ticket) =>
      deleteFromDataSource(
        dataSourceConfig,
        getTicketInternalId(ticket.connectorId, ticket.ticketId)
      )
    )
  );
  /// deleting the tickets stored in the db
  await ZendeskTicketResource.deleteByBrandId({ connectorId, brandId });
}

/**
 * Deletes all the data stored in the db and in the data source relative to a brand's help center (category, articles).
 */
async function deleteBrandHelpCenter({
  connectorId,
  brandId,
  dataSourceConfig,
}: {
  connectorId: number;
  brandId: number;
  dataSourceConfig: DataSourceConfig;
}) {
  /// deleting the articles in the data source
  const articles = await ZendeskArticleResource.fetchByBrandId({
    connectorId,
    brandId,
  });
  await Promise.all(
    articles.map((article) =>
      deleteFromDataSource(
        dataSourceConfig,
        getArticleInternalId(connectorId, article.articleId)
      )
    )
  );
  /// deleting the articles stored in the db
  await ZendeskArticleResource.deleteByBrandId({
    connectorId,
    brandId,
  });
  /// deleting the categories stored in the db
  await ZendeskCategoryResource.deleteByBrandId({ connectorId, brandId });
}

/**
 * Deletes all the data stored in the db and in the data source relative to a category (articles).
 */
async function deleteCategoryChildren({
  connectorId,
  categoryId,
  dataSourceConfig,
}: {
  connectorId: number;
  categoryId: number;
  dataSourceConfig: DataSourceConfig;
}) {
  /// deleting the articles in the data source
  const articles = await ZendeskArticleResource.fetchByCategoryId({
    connectorId,
    categoryId,
  });
  await Promise.all(
    articles.map((article) =>
      deleteFromDataSource(
        dataSourceConfig,
        getArticleInternalId(connectorId, article.articleId)
      )
    )
  );
  /// deleting the articles stored in the db
  await ZendeskArticleResource.deleteByCategoryId({
    connectorId,
    categoryId,
  });
}
