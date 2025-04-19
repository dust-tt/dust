import { syncArticle } from "@connectors/connectors/zendesk/lib/sync_article";
import {
  deleteTicket,
  shouldSyncTicket,
  syncTicket,
} from "@connectors/connectors/zendesk/lib/sync_ticket";
import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  fetchZendeskCategory,
  fetchZendeskSection,
  fetchZendeskUser,
  getZendeskBrandSubdomain,
  listRecentlyUpdatedArticles,
  listZendeskTicketComments,
  listZendeskTickets,
  listZendeskUsers,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { ZendeskTimestampCursorModel } from "@connectors/lib/models/zendesk";
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
 * Retrieves the timestamp cursor, which is the start date of the last successful incremental sync.
 */
export async function getZendeskTimestampCursorActivity(
  connectorId: ModelId
): Promise<Date> {
  const cursors = await ZendeskTimestampCursorModel.findOne({
    where: { connectorId },
  });
  if (!cursors) {
    throw new Error("[Zendesk] Timestamp cursor not found.");
  }
  // we get a StartTimeTooRecent error before 1 minute
  const minAgo = Date.now() - 60 * 1000; // 1 minute ago
  return new Date(Math.min(cursors.timestampCursor.getTime(), minAgo));
}

/**
 * Sets the timestamp cursor to the start date of the last successful incremental sync.
 */
export async function setZendeskTimestampCursorActivity({
  connectorId,
  currentSyncDateMs,
}: {
  connectorId: ModelId;
  currentSyncDateMs: number;
}) {
  const cursors = await ZendeskTimestampCursorModel.findOne({
    where: { connectorId },
  });
  if (!cursors) {
    throw new Error("[Zendesk] Timestamp cursor not found.");
  }
  await cursors.update({
    timestampCursor: new Date(currentSyncDateMs), // setting this as the start date of the sync (last successful sync)
  });
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

  const brand = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });
  const hasHelpCenterPermissions = brand?.helpCenterPermission === "read";

  const { accessToken, subdomain } = await getZendeskSubdomainAndAccessToken(
    connector.connectionId
  );
  const brandSubdomain = await getZendeskBrandSubdomain({
    connectorId,
    brandId,
    subdomain,
    accessToken,
  });

  const { articles, hasMore, endTime } = await listRecentlyUpdatedArticles({
    subdomain,
    brandSubdomain,
    accessToken,
    startTime,
  });

  await concurrentExecutor(
    articles,
    async (article) => {
      const section = await fetchZendeskSection({
        accessToken,
        brandSubdomain,
        sectionId: article.section_id,
      });
      const user = await fetchZendeskUser({
        accessToken,
        brandSubdomain,
        userId: article.author_id,
      });

      if (section && section.category_id) {
        let category = await ZendeskCategoryResource.fetchByCategoryId({
          connectorId,
          brandId,
          categoryId: section.category_id,
        });
        /// fetching and adding the category to the db if it is newly created, and the Help Center is selected
        if (!category && hasHelpCenterPermissions) {
          const { category_id: categoryId } = section;
          const fetchedCategory = await fetchZendeskCategory({
            accessToken,
            brandSubdomain,
            categoryId,
          });
          if (fetchedCategory) {
            category = await ZendeskCategoryResource.makeNew({
              blob: {
                connectorId,
                brandId,
                name: fetchedCategory.name || "Category",
                categoryId,
                permission: "none",
                url: fetchedCategory.html_url,
                description: fetchedCategory.description,
              },
            });
            // upserting a folder to data_sources_folders: here the Help Center is selected so it should appear in the parents
            const parents = category.getParentInternalIds(connectorId);
            await upsertDataSourceFolder({
              dataSourceConfig,
              folderId: parents[0],
              parents,
              parentId: parents[1],
              title: category.name,
              mimeType: INTERNAL_MIME_TYPES.ZENDESK.CATEGORY,
              sourceUrl: category.url,
            });
          } else {
            /// ignoring these to proceed with the other articles, but these might have to be checked at some point
            logger.error(
              { article, categoryId },
              "[Zendesk] Category could not be fetched."
            );
          }
        }
        /// syncing the article if the category exists and is selected
        if (
          category &&
          (category.permission === "read" || hasHelpCenterPermissions)
        ) {
          return syncArticle({
            connectorId,
            category,
            article,
            section,
            user,
            helpCenterIsAllowed: hasHelpCenterPermissions,
            dataSourceConfig,
            currentSyncDateMs,
            loggerArgs,
          });
        }
      }
    },
    { concurrency: 10 }
  );
  return hasMore ? endTime : null;
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
  url,
}: {
  connectorId: ModelId;
  brandId: number;
  startTime: number;
  currentSyncDateMs: number;
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

  const { accessToken, subdomain } = await getZendeskSubdomainAndAccessToken(
    connector.connectionId
  );
  const brandSubdomain = await getZendeskBrandSubdomain({
    connectorId,
    brandId,
    subdomain,
    accessToken,
  });

  const { tickets, hasMore, nextLink } = await listZendeskTickets(
    accessToken,
    url ? { url } : { brandSubdomain, startTime }
  );

  await concurrentExecutor(
    tickets,
    async (ticket) => {
      if (ticket.status === "deleted") {
        return deleteTicket({
          connectorId,
          brandId,
          ticketId: ticket.id,
          dataSourceConfig,
          loggerArgs,
        });
      } else if (shouldSyncTicket(ticket, configuration)) {
        const comments = await listZendeskTicketComments({
          accessToken,
          brandSubdomain,
          ticketId: ticket.id,
        });
        const users = await listZendeskUsers({
          accessToken,
          brandSubdomain,
          userIds: comments.map((c) => c.author_id),
        });
        return syncTicket(ticket, connector, configuration, {
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
  return { hasMore, nextLink };
}
