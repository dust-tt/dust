import type { ModelId } from "@dust-tt/types";

import { deleteTicket } from "@connectors/connectors/zendesk/lib/sync_ticket";
import { ZENDESK_BATCH_SIZE } from "@connectors/connectors/zendesk/temporal/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
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
