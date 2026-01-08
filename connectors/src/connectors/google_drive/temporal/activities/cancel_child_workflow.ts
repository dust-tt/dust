import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";

/**
 * Activity to cancel a child workflow by workflow ID.
 * This is needed because workflows cannot directly cancel child workflows -
 * they need to use the Temporal client which is only available in activities.
 */
export async function cancelChildWorkflow(workflowId: string): Promise<void> {
  const client = await getTemporalClient();

  try {
    const handle = client.workflow.getHandle(workflowId);
    await handle.cancel();
  } catch (e) {
    // Workflow may not exist or already completed, which is fine
    logger.info(`Failed to cancel workflow ${workflowId}: ${e}`);
  }
}
