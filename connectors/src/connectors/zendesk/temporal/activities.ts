import _ from "lodash";

import {
  getCategoryInternalId,
  getHelpCenterInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import { syncArticle } from "@connectors/connectors/zendesk/lib/sync_article";
import { syncCategory } from "@connectors/connectors/zendesk/lib/sync_category";
import {
  shouldSyncTicket,
  syncTicket,
} from "@connectors/connectors/zendesk/lib/sync_ticket";
import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  fetchZendeskBrand,
  fetchZendeskCategory,
  getZendeskBrandSubdomain,
  listZendeskArticlesInCategory,
  listZendeskCategoriesInBrand,
  listZendeskSectionsByCategory,
  listZendeskTicketComments,
  listZendeskTickets,
  listZendeskUsers,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
import { ZENDESK_BATCH_SIZE } from "@connectors/connectors/zendesk/temporal/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  deleteDataSourceFolder,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import { ZendeskTimestampCursorModel } from "@connectors/lib/models/zendesk";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import { heartbeat } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  ZendeskBrandResource,
  ZendeskCategoryResource,
  ZendeskConfigurationResource,
} from "@connectors/resources/zendesk_resources";
import type { ModelId } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

/**
 * This activity is responsible for updating the lastSyncStartTime of the connector to now.
 */
export async function zendeskConnectorStartSync(
  connectorId: ModelId
): Promise<{ cursor: Date | null }> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }
  const res = await syncStarted(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
  const cursor = await ZendeskTimestampCursorModel.findOne({
    where: { connectorId },
  });

  return { cursor: cursor?.timestampCursor ?? null };
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
  const cursors = await ZendeskTimestampCursorModel.findOne({
    where: { connectorId },
  });
  if (!cursors) {
    await ZendeskTimestampCursorModel.create({
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

  const { subdomain, accessToken } = await getZendeskSubdomainAndAccessToken(
    connector.connectionId
  );
  const fetchedBrand = await fetchZendeskBrand({
    subdomain,
    accessToken,
    brandId,
  });

  // if the brand is not on Zendesk anymore, we delete it
  if (!fetchedBrand) {
    await brandInDb.revokeTicketsPermissions();
    await brandInDb.revokeHelpCenterPermissions();
    return { helpCenterAllowed: false, ticketsAllowed: false };
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const helpCenterNode = brandInDb.getHelpCenterContentNode(connectorId, {
    richTitle: true,
  });
  // syncing the folders in data_sources_folders (core) for the nodes that are selected among the Help Center and the Tickets
  if (brandInDb.helpCenterPermission === "read") {
    await upsertDataSourceFolder({
      dataSourceConfig,
      folderId: helpCenterNode.internalId,
      parents: [helpCenterNode.internalId],
      parentId: null,
      title: helpCenterNode.title,
      mimeType: INTERNAL_MIME_TYPES.ZENDESK.HELP_CENTER,
      timestampMs: currentSyncDateMs,
    });

    // updating the parents for the already selected categories to add the Help Center
    const selectedCategories =
      await ZendeskCategoryResource.fetchSelectedCategoriesInBrand({
        connectorId,
        brandId,
      });
    for (const category of selectedCategories) {
      // here we can just take all the possible parents since we are syncing the categories through their Help Center
      const parents = category.getParentInternalIds(connectorId);
      await upsertDataSourceFolder({
        dataSourceConfig,
        folderId: parents[0],
        parents,
        parentId: parents[1],
        title: category.name,
        mimeType: INTERNAL_MIME_TYPES.ZENDESK.CATEGORY,
        sourceUrl: category.url,
        timestampMs: currentSyncDateMs,
      });
    }
  } else {
    await deleteDataSourceFolder({
      dataSourceConfig,
      folderId: helpCenterNode.internalId,
    });

    // Delete categories that were only synced because the Help Center was selected but were not explicitly selected by the user in the UI.
    const categoriesNotSelected =
      await ZendeskCategoryResource.fetchUnselectedCategoriesInBrand({
        connectorId,
        brandId,
      });
    for (const category of categoriesNotSelected) {
      await deleteDataSourceFolder({
        dataSourceConfig,
        folderId: getCategoryInternalId({
          connectorId,
          brandId,
          categoryId: category.categoryId,
        }),
      });
    }

    // Update the parents for the categories that were selected to turn them into roots.
    const selectedCategories =
      await ZendeskCategoryResource.fetchSelectedCategoriesInBrand({
        connectorId,
        brandId,
      });
    for (const category of selectedCategories) {
      const folderId = getCategoryInternalId({
        connectorId,
        brandId,
        categoryId: category.categoryId,
      });
      await upsertDataSourceFolder({
        dataSourceConfig,
        folderId,
        parents: [folderId],
        parentId: null,
        title: category.name,
        mimeType: INTERNAL_MIME_TYPES.ZENDESK.CATEGORY,
        sourceUrl: category.url,
        timestampMs: currentSyncDateMs,
      });
    }
  }

  const ticketsNode = brandInDb.getTicketsContentNode(connectorId, {
    richTitle: true,
  });
  if (brandInDb.ticketsPermission === "read") {
    await upsertDataSourceFolder({
      dataSourceConfig,
      folderId: ticketsNode.internalId,
      parents: [ticketsNode.internalId],
      parentId: null,
      title: ticketsNode.title,
      mimeType: INTERNAL_MIME_TYPES.ZENDESK.TICKETS,
      timestampMs: currentSyncDateMs,
    });
  } else {
    await deleteDataSourceFolder({
      dataSourceConfig,
      folderId: ticketsNode.internalId,
    });
  }

  // updating the entry in db
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
 * Retrieves the IDs of every brand in db that has read permissions on their Help Center or in one of their Categories.
 * Removes the permissions beforehand for Help Center that have been deleted or disabled on Zendesk.
 * This activity will be used to retrieve the brands that need to be incrementally synced.
 *
 * Note: in this approach; if a single category has read permissions and not its Help Center,
 * diffs for the whole Help Center are fetched since there is no endpoint that returns the diff for the Category.
 */
export async function getZendeskHelpCenterReadAllowedBrandIdsActivity(
  connectorId: ModelId
): Promise<number[]> {
  // fetching the brands that have a Help Center selected as a whole
  const brandsWithHelpCenter =
    await ZendeskBrandResource.fetchHelpCenterReadAllowedBrandIds(connectorId);

  // cleaning up Brands (resp. Help Centers) that don't exist on Zendesk anymore (resp. have been deleted)
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }
  const { subdomain, accessToken } = await getZendeskSubdomainAndAccessToken(
    connector.connectionId
  );
  for (const brandId of brandsWithHelpCenter) {
    const fetchedBrand = await fetchZendeskBrand({
      accessToken,
      subdomain,
      brandId,
    });
    const brandInDb = await ZendeskBrandResource.fetchByBrandId({
      connectorId,
      brandId,
    });
    if (!fetchedBrand) {
      await brandInDb?.revokeTicketsPermissions();
      await brandInDb?.revokeHelpCenterPermissions();
    } else if (!fetchedBrand.has_help_center) {
      await brandInDb?.revokeHelpCenterPermissions();
    }
  }

  // fetching the brands that have at least one Category selected:
  // we need to do that because we can only fetch diffs at the brand level.
  // We will filter later on the categories allowed.
  const brandWithCategories =
    await ZendeskCategoryResource.fetchBrandIdsOfReadOnlyCategories(
      connectorId
    );
  // removing duplicates
  return [...new Set([...brandsWithHelpCenter, ...brandWithCategories])];
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
 * This activity is responsible for syncing a batch of Categories.
 * It does not sync the articles inside the Category, only the Category data in itself.
 *
 * It is going to update the Categories if they have changed on Zendesk
 */
export async function syncZendeskCategoryBatchActivity({
  connectorId,
  brandId,
  currentSyncDateMs,
  url,
}: {
  connectorId: ModelId;
  brandId: number;
  currentSyncDateMs: number;
  url: string | null;
}): Promise<{
  categoriesToUpdate: number[];
  hasMore: boolean;
  nextLink: string | null;
}> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const { accessToken, subdomain } = await getZendeskSubdomainAndAccessToken(
    connector.connectionId
  );
  const brandSubdomain = await getZendeskBrandSubdomain({
    brandId,
    connectorId,
    accessToken,
    subdomain,
  });

  const brandInDb = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });

  const { categories, hasMore, nextLink } = await listZendeskCategoriesInBrand(
    accessToken,
    url ? { url } : { brandSubdomain, pageSize: ZENDESK_BATCH_SIZE }
  );

  await concurrentExecutor(
    categories,
    async (category) => {
      return syncCategory({
        connectorId,
        brandId,
        category,
        isHelpCenterSelected: brandInDb?.helpCenterPermission === "read",
        currentSyncDateMs,
        dataSourceConfig,
      });
    },
    {
      concurrency: 10,
      onBatchComplete: heartbeat,
    }
  );

  return {
    categoriesToUpdate: categories.map((category) => category.id),
    hasMore,
    nextLink,
  };
}

/**
 * This activity is responsible for syncing a single Category.
 * It does not sync the articles inside the Category, only the Category data in itself.
 *
 * It is going to update the name, description and URL of the Category if they have changed.
 * If the Category is not present on Zendesk anymore, it will delete all its data as well.
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
}): Promise<{
  shouldSyncArticles: boolean;
  helpCenterIsAllowed: boolean | null;
}> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }
  const categoryInDb = await ZendeskCategoryResource.fetchByCategoryId({
    connectorId,
    brandId,
    categoryId,
  });
  if (!categoryInDb) {
    throw new Error(
      `[Zendesk] Category not found, connectorId: ${connectorId}, categoryId: ${categoryId}`
    );
  }

  // Remove the category if was explicitly unselected in the UI.
  if (categoryInDb.permission === "none") {
    await deleteDataSourceFolder({
      dataSourceConfig: dataSourceConfigFromConnector(connector),
      folderId: getCategoryInternalId({ connectorId, brandId, categoryId }),
    });
    // note that the articles will be deleted in the garbage collection
    return { shouldSyncArticles: false, helpCenterIsAllowed: null };
  }

  const { accessToken, subdomain } = await getZendeskSubdomainAndAccessToken(
    connector.connectionId
  );
  const brandSubdomain = await getZendeskBrandSubdomain({
    connectorId,
    accessToken,
    subdomain,
    brandId,
  });

  // if the category is not on Zendesk anymore, we remove its permissions
  const fetchedCategory = await fetchZendeskCategory({
    accessToken,
    brandSubdomain,
    categoryId,
  });
  if (!fetchedCategory) {
    await categoryInDb.revokePermissions();
    return { shouldSyncArticles: false, helpCenterIsAllowed: null };
  }

  // upserting a folder to data_sources_folders (core)
  const brandInDb = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });
  const folderId = getCategoryInternalId({ connectorId, brandId, categoryId });
  // adding the parents to the array of parents iff the Help Center was selected
  const parentId =
    brandInDb?.helpCenterPermission === "read"
      ? getHelpCenterInternalId({ connectorId, brandId })
      : null;
  const parents = parentId ? [folderId, parentId] : [folderId];

  await upsertDataSourceFolder({
    dataSourceConfig: dataSourceConfigFromConnector(connector),
    folderId,
    parents,
    parentId,
    title: fetchedCategory.name,
    mimeType: INTERNAL_MIME_TYPES.ZENDESK.CATEGORY,
    sourceUrl: fetchedCategory.html_url,
    timestampMs: currentSyncDateMs,
  });

  // otherwise, we update the category name and lastUpsertedTs
  await categoryInDb.update({
    name: fetchedCategory.name || "Category",
    url: fetchedCategory.html_url,
    description: fetchedCategory.description,
    lastUpsertedTs: new Date(currentSyncDateMs),
  });
  return {
    shouldSyncArticles: true,
    helpCenterIsAllowed: brandInDb?.helpCenterPermission === "read",
  };
}

/**
 * This activity is responsible for syncing the next batch of articles to process.
 * It does not sync the Category, only the Articles.
 */
export async function syncZendeskArticleBatchActivity({
  connectorId,
  brandId,
  categoryId,
  currentSyncDateMs,
  helpCenterIsAllowed,
  url,
}: {
  connectorId: ModelId;
  brandId: number;
  categoryId: number;
  currentSyncDateMs: number;
  helpCenterIsAllowed: boolean;
  url: string | null;
}): Promise<{ hasMore: boolean; nextLink: string | null }> {
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
  const category = await ZendeskCategoryResource.fetchByCategoryId({
    connectorId,
    brandId,
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
  const brandSubdomain = await getZendeskBrandSubdomain({
    brandId: category.brandId,
    connectorId,
    accessToken,
    subdomain,
  });

  const { articles, hasMore, nextLink } = await listZendeskArticlesInCategory(
    category,
    accessToken,
    url ? { url } : { brandSubdomain, pageSize: ZENDESK_BATCH_SIZE }
  );

  logger.info(
    { ...loggerArgs, articlesSynced: articles.length },
    `[Zendesk] Processing ${articles.length} articles in batch`
  );

  const sections = await listZendeskSectionsByCategory({
    accessToken,
    brandSubdomain,
    categoryId,
  });
  const users = await listZendeskUsers({
    accessToken,
    brandSubdomain,
    userIds: articles.map((article) => article.author_id),
  });

  await concurrentExecutor(
    articles,
    (article) =>
      syncArticle({
        article,
        connector,
        configuration,
        category,
        section:
          sections.find((section) => section.id === article.section_id) || null,
        user: users.find((user) => user.id === article.author_id) || null,
        dataSourceConfig,
        helpCenterIsAllowed,
        currentSyncDateMs,
        loggerArgs,
      }),
    {
      concurrency: 10,
      onBatchComplete: heartbeat,
    }
  );
  return { hasMore, nextLink };
}

/**
 * This activity is responsible for syncing the next batch of tickets to process.
 */
export async function syncZendeskTicketBatchActivity({
  connectorId,
  brandId,
  currentSyncDateMs,
  forceResync,
  url,
}: {
  connectorId: ModelId;
  brandId: number;
  currentSyncDateMs: number;
  forceResync: boolean;
  url: string | null;
}): Promise<{ hasMore: boolean; nextLink: string | null }> {
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
  const brandSubdomain = await getZendeskBrandSubdomain({
    connectorId,
    brandId,
    accessToken,
    subdomain,
  });

  const startTime =
    Math.floor(currentSyncDateMs / 1000) -
    configuration.retentionPeriodDays * 24 * 60 * 60; // days to seconds
  const { tickets, hasMore, nextLink } = await listZendeskTickets(
    accessToken,
    url ? { url } : { brandSubdomain, startTime }
  );

  if (tickets.length === 0) {
    logger.info(
      { ...loggerArgs, ticketsSynced: 0 },
      `[Zendesk] No tickets to process in batch - stopping.`
    );
    return { hasMore: false, nextLink: "" };
  }

  const ticketsToSync = tickets.filter((t) =>
    shouldSyncTicket(t, configuration)
  );

  const comments2d = await concurrentExecutor(
    ticketsToSync,
    async (ticket) =>
      listZendeskTicketComments({
        accessToken,
        brandSubdomain,
        ticketId: ticket.id,
      }),
    { concurrency: 3, onBatchComplete: heartbeat }
  );
  const users = await listZendeskUsers({
    accessToken,
    brandSubdomain,
    userIds: [
      ...new Set(
        comments2d.flatMap((comments) => comments.map((c) => c.author_id))
      ),
    ],
  });

  const res = await concurrentExecutor(
    _.zip(ticketsToSync, comments2d),
    async ([ticket, comments]) => {
      if (!ticket || !comments) {
        throw new Error(
          `[Zendesk] Unreachable: Ticket or comments not found, ticket: ${ticket}, comments: ${comments}`
        );
      }

      return syncTicket({
        ticket,
        connector,
        configuration,
        brandId,
        dataSourceConfig,
        currentSyncDateMs,
        loggerArgs,
        forceResync,
        comments,
        users,
      });
    },
    {
      concurrency: 10,
      onBatchComplete: heartbeat,
    }
  );

  logger.info(
    { ...loggerArgs, ticketsSynced: res.filter((r) => r).length },
    `[Zendesk] Processing ${res.length} tickets in batch`
  );

  return { hasMore, nextLink };
}
