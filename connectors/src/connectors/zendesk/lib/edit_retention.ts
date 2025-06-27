import { launchZendeskTicketReSyncWorkflow } from "@connectors/connectors/zendesk/temporal/client";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

/**
 * Triggers a ticket sync for a Zendesk connector when retention period is increased.
 *
 * @param connector - The Zendesk connector resource
 * @param currentRetentionDays - The previous retention period
 * @param newRetentionDays - The new retention period
 */
export async function updateRetentionPeriod(
  connector: ConnectorResource,
  currentRetentionDays: number,
  newRetentionDays: number
): Promise<void> {
  const connectorId = connector.id;

  // Only trigger sync if retention period is increased
  if (newRetentionDays <= currentRetentionDays) {
    logger.info(
      { connectorId, currentRetentionDays, newRetentionDays },
      "Retention period not increased - skipping sync"
    );
    return;
  }

  logger.info(
    { connectorId, currentRetentionDays, newRetentionDays },
    "Retention period increased - scheduling ticket sync"
  );

  // Schedule a new ticket sync
  try {
    logger.info(
      { connectorId, newRetentionDays },
      "Executing ticket sync for retention period increase"
    );

    const syncResult = await launchZendeskTicketReSyncWorkflow(connector, {
      forceResync: false, // Don't force resync, just sync newly included tickets
    });

    if (syncResult.isErr()) {
      logger.error(
        { connectorId, error: syncResult.error },
        "Failed to execute ticket sync"
      );
    } else {
      logger.info(
        { connectorId, workflowId: syncResult.value },
        "Successfully executed ticket sync"
      );
    }
  } catch (error) {
    logger.error({ connectorId, error }, "Error executing ticket sync");
  }
}
