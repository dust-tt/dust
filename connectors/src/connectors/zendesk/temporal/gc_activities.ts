import type { ModelId } from "@dust-tt/types";

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
  ZendeskConfigurationResource,
  ZendeskTicketResource,
} from "@connectors/resources/zendesk_resources";

/**
 * This activity is responsible for fetching a batch of tickets
 * that are older than the retention period and ready to be deleted.
 */
export async function getNextOldTicketBatchActivity(
  connectorId: ModelId
): Promise<number[]> {
  const configuration =
    await ZendeskConfigurationResource.fetchByConnectorId(connectorId);
  if (!configuration) {
    throw new Error(
      `[Zendesk] Configuration not found, connectorId: ${connectorId}`
    );
  }
  return ZendeskTicketResource.fetchOutdatedTicketIds({
    connectorId,
    expirationDate: new Date(
      Date.now() - configuration.retentionPeriodDays * 24 * 60 * 60 * 1000 // conversion from days to ms
    ),
    batchSize: ZENDESK_BATCH_SIZE,
  });
}

/**
 * This activity is responsible for deleting a batch of tickets given their IDs.
 */
export async function deleteTicketBatchActivity(
  connectorId: ModelId,
  ticketIds: number[]
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
    dataSourceId: dataSourceConfig.dataSourceId,
  };

  await concurrentExecutor(
    ticketIds,
    (ticketId) =>
      deleteTicket({ connectorId, ticketId, dataSourceConfig, loggerArgs }),
    { concurrency: 10 }
  );
}

/**
 * This activity is responsible for fetching a batch of articles.
 */
export async function getNextArticleBatchActivity({
  connectorId,
  brandId,
  cursor,
}: {
  connectorId: ModelId;
  brandId: number;
  cursor: number | null;
}): Promise<{ articleIds: number[]; cursor: number | null }> {
  return ZendeskArticleResource.fetchBatchByBrandId({
    connectorId,
    brandId,
    cursor,
    batchSize: ZENDESK_BATCH_SIZE,
  });
}

/**
 * This activity is responsible for garbage collecting a batch of articles given their IDs.
 */
export async function garbageCollectArticleBatchActivity({
  connectorId,
  brandId,
  articleIds,
}: {
  connectorId: ModelId;
  brandId: number;
  articleIds: number[];
}): Promise<void> {
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
}
