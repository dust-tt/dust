import assert from "assert";

import { clearOrganizationCache } from "@connectors/connectors/zendesk/lib/in_memory_cache";
import { syncArticle } from "@connectors/connectors/zendesk/lib/sync_article";
import {
  deleteTicket,
  shouldSyncTicket,
  syncTicket,
} from "@connectors/connectors/zendesk/lib/sync_ticket";
import type { ZendeskTicketComment } from "@connectors/connectors/zendesk/lib/types";
import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import { ZendeskClient } from "@connectors/connectors/zendesk/lib/zendesk_api";
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

  const brand = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });
  const hasHelpCenterPermissions = brand?.helpCenterPermission === "read";

  const { accessToken, subdomain } = await getZendeskSubdomainAndAccessToken(
    connector.connectionId
  );

  const zendeskClient = new ZendeskClient(
    accessToken,
    connectorId,
    configuration.rateLimitTransactionsPerSecond
  );

  const brandSubdomain = await zendeskClient.getBrandSubdomain({
    brandId,
    subdomain,
  });

  const { articles, hasMore, endTime } =
    await zendeskClient.listRecentlyUpdatedArticles({
      brandSubdomain,
      startTime,
    });

  await concurrentExecutor(
    articles,
    async (article) => {
      const section = await zendeskClient.fetchSection({
        brandSubdomain,
        sectionId: article.section_id,
      });
      const user = configuration.hideCustomerDetails
        ? null
        : await zendeskClient.fetchUser({
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
          const fetchedCategory = await zendeskClient.fetchCategory({
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
            article,
            connector,
            configuration,
            category,
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

  const zendeskClient = new ZendeskClient(
    accessToken,
    connectorId,
    configuration.rateLimitTransactionsPerSecond
  );

  const brandSubdomain = await zendeskClient.getBrandSubdomain({
    brandId,
    subdomain,
  });

  const { tickets, hasMore, nextLink } = await zendeskClient.listTickets(
    url ? { url } : { brandSubdomain, startTime }
  );

  const commentsPerTicket: Record<number, ZendeskTicketComment[]> = {};
  await concurrentExecutor(
    tickets,
    async (ticket) => {
      const comments = await zendeskClient.listTicketComments({
        brandSubdomain,
        ticketId: ticket.id,
      });
      if (comments.length > 0) {
        logger.info(
          { ...loggerArgs, ticketId: ticket.id },
          "[Zendesk] No comment for ticket."
        );
      }
      commentsPerTicket[ticket.id] = comments;
    },
    { concurrency: 3 }
  );

  // If we hide customer details, we don't need to fetch the users at all.
  // Also guarantees that user information is not included in the ticket content.
  const users = configuration.hideCustomerDetails
    ? []
    : await zendeskClient.listUsers({
        brandSubdomain,
        userIds: [
          ...new Set(
            Object.values(commentsPerTicket).flatMap((comments) =>
              comments.map((c) => c.author_id)
            )
          ),
        ],
      });

  let organizationTagsMap = new Map<number, string[]>();
  if (configuration.enforcesOrganizationTagConstraint()) {
    organizationTagsMap = await zendeskClient.getOrganizationTagMapForTickets(
      tickets,
      { brandSubdomain }
    );
  }

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
      }

      let organizationTags: string[] = [];
      if (
        ticket.organization_id &&
        configuration.enforcesOrganizationTagConstraint()
      ) {
        const mapValue = organizationTagsMap.get(ticket.organization_id);
        assert(mapValue, "Organization tags not found.");
        organizationTags = mapValue;
      }

      if (
        shouldSyncTicket(ticket, configuration, {
          brandId,
          organizationTags,
          ticketTags: ticket.tags,
        }).shouldSync
      ) {
        const comments = commentsPerTicket[ticket.id];
        if (!comments) {
          throw new Error(
            `[Zendesk] Comments not found for ticket ${ticket.id}`
          );
        }
        return syncTicket({
          ticket,
          connector,
          configuration,
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

  if (!hasMore) {
    clearOrganizationCache({ brandSubdomain });
  }
  return { hasMore, nextLink };
}
