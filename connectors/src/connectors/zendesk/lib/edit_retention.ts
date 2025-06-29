import { getConnectorManager } from "@connectors/connectors";
import { launchZendeskTicketReSyncWorkflow } from "@connectors/connectors/zendesk/temporal/client";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { ZendeskConfigurationResource } from "@connectors/resources/zendesk_resources";

export async function updateRetentionPeriod(
  connector: ConnectorResource,
  newRetentionDays: number
): Promise<void> {
  const connectorId = connector.id;
  const zendeskConfiguration =
    await ZendeskConfigurationResource.fetchByConnectorId(connectorId);
  if (!zendeskConfiguration) {
    logger.error({ connectorId }, "[Zendesk] Configuration not found.");
    throw new Error("[Zendesk] Configuration not found.");
  }
  const currentRetentionDays = zendeskConfiguration.retentionPeriodDays;

  const connectorManager = getConnectorManager({
    connectorProvider: connector.type,
    connectorId: connector.id,
  });

  const result = await connectorManager.setConfigurationKey({
    configKey: "zendeskRetentionPeriodDays",
    configValue: newRetentionDays.toString(),
  });

  if (result.isErr()) {
    logger.error(
      { connectorId, error: result.error },
      "[Zendesk] Failed to update retention period configuration"
    );
    throw result.error;
  }
  //Triggers a ticket sync for a Zendesk connector when retention period is increased.
  if (newRetentionDays <= currentRetentionDays) {
    logger.info(
      { connectorId, currentRetentionDays, newRetentionDays },
      "[Zendesk] Retention period not increased - skipping sync"
    );
    return;
  }

  logger.info(
    { connectorId, newRetentionDays },
    "[Zendesk] Executing ticket sync for retention period increase"
  );

  const syncResult = await launchZendeskTicketReSyncWorkflow(connector, {
    forceResync: false,
  });

  if (syncResult.isErr()) {
    logger.error(
      { connectorId, error: syncResult.error },
      "[Zendesk] Failed to execute ticket sync"
    );
  } else {
    logger.info(
      { connectorId, workflowId: syncResult.value },
      "[Zendesk] Successfully executed ticket sync"
    );
  }
}
