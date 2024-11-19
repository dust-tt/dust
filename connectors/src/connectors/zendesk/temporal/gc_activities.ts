import type { ModelId } from "@dust-tt/types";

import {
  deleteBrandHelpCenter,
  deleteBrandTickets,
} from "@connectors/connectors/zendesk/lib/data_cleanup";
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
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  ZendeskArticleResource,
  ZendeskBrandResource,
  ZendeskCategoryResource,
  ZendeskConfigurationResource,
  ZendeskTicketResource,
} from "@connectors/resources/zendesk_resources";

/**
 * This activity is responsible for fetching and cleaning up a batch of tickets
 * that are older than the retention period and ready to be deleted.
 */
export async function garbageCollectTicketBatchActivity(
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
export async function garbageCollectArticleBatchActivity({
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
 * This activity is responsible for cleaning up a Brand.
 *
 * If the Brand is not allowed anymore, it will delete all its data.
 * If the Help Center has no readable category anymore, we delete the Help Center data.
 *
 * @returns the updated permissions of the Brand.
 */
export async function garbageCollectBrandActivity({
  connectorId,
  brandId,
}: {
  connectorId: ModelId;
  brandId: number;
}): Promise<void> {
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
    return;
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
      return;
    }
    await brandInDb.revokeHelpCenterPermissions();
  }
}
