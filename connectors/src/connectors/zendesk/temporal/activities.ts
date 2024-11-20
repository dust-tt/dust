import type { ModelId } from "@dust-tt/types";

import { deleteCategory } from "@connectors/connectors/zendesk/lib/data_cleanup";
import { syncArticle } from "@connectors/connectors/zendesk/lib/sync_article";
import { syncTicket } from "@connectors/connectors/zendesk/lib/sync_ticket";
import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  changeZendeskClientSubdomain,
  createZendeskClient,
  fetchZendeskArticlesInCategory,
  fetchZendeskTicketsInBrand,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
import { ZENDESK_BATCH_SIZE } from "@connectors/connectors/zendesk/temporal/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { ZendeskTimestampCursors } from "@connectors/lib/models/zendesk";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  ZendeskBrandResource,
  ZendeskCategoryResource,
  ZendeskConfigurationResource,
} from "@connectors/resources/zendesk_resources";

/**
 * This activity is responsible for updating the lastSyncStartTime of the connector to now.
 */
export async function saveZendeskConnectorStartSync(connectorId: ModelId) {
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
export async function saveZendeskConnectorSuccessSync(
  connectorId: ModelId,
  currentSyncDateMs: number
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }

  // initializing the timestamp cursor if it does not exist (first sync, not incremental)
  const cursors = await ZendeskTimestampCursors.findOne({
    where: { connectorId },
  });
  if (!cursors) {
    await ZendeskTimestampCursors.create({
      connectorId,
      timestampCursor: new Date(currentSyncDateMs),
    });
  }

  const res = await syncSucceeded(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

/**
 * This activity is responsible for syncing a Brand.
 * It does not sync the content inside the Brand, only the Brand data in itself (name, url, subdomain, lastUpsertedTs).
 * If the brand is not found in Zendesk, it deletes it.
 *
 * @returns the permissions of the Brand.
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

  const brandInDb = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });
  if (!brandInDb) {
    throw new Error(
      `[Zendesk] Brand not found, connectorId: ${connectorId}, brandId: ${brandId}`
    );
  }

  const zendeskApiClient = createZendeskClient(
    await getZendeskSubdomainAndAccessToken(connector.connectionId)
  );
  const {
    result: { brand: fetchedBrand },
  } = await zendeskApiClient.brand.show(brandId);

  // if the brand is not on Zendesk anymore, we delete it
  if (!fetchedBrand) {
    await brandInDb.revokeTicketsPermissions();
    await brandInDb.revokeHelpCenterPermissions();
    return { helpCenterAllowed: false, ticketsAllowed: false };
  }

  // otherwise, we update the brand data and lastUpsertedTs
  await brandInDb.update({
    name: fetchedBrand.name || "Brand",
    url: fetchedBrand?.url || brandInDb.url,
    subdomain: fetchedBrand?.subdomain || brandInDb.subdomain,
    lastUpsertedTs: new Date(currentSyncDateMs),
  });

  return {
    helpCenterAllowed: brandInDb.helpCenterPermission === "read",
    ticketsAllowed: brandInDb.ticketsPermission === "read",
  };
}

/**
 * Retrieves the IDs of every brand stored in db that has read permissions on their Help Center.
 */
export async function getZendeskHelpCenterReadAllowedBrandIdsActivity(
  connectorId: ModelId
): Promise<number[]> {
  return ZendeskBrandResource.fetchHelpCenterReadAllowedBrandIds(connectorId);
}

/**
 * Retrieves the IDs of every brand stored in db that has read permissions on their Tickets.
 */
export async function getZendeskTicketsAllowedBrandIdsActivity(
  connectorId: ModelId
): Promise<number[]> {
  return ZendeskBrandResource.fetchTicketsAllowedBrandIds(connectorId);
}

/**
 * Retrieves the categories for a given Brand.
 */
export async function fetchZendeskCategoriesActivity({
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
    await deleteCategory({ connectorId, dataSourceConfig, categoryId });
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
    await deleteCategory({ connectorId, categoryId, dataSourceConfig });
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
  const configuration =
    await ZendeskConfigurationResource.fetchByConnectorId(connectorId);
  if (!configuration) {
    throw new Error(`[Zendesk] Configuration not found.`);
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

  const { tickets, meta } = await fetchZendeskTicketsInBrand({
    brandSubdomain,
    accessToken,
    pageSize: ZENDESK_BATCH_SIZE,
    cursor,
    retentionPeriodDays: configuration.retentionPeriodDays,
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
