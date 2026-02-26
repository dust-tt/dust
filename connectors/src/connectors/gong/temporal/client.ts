import { QUEUE_NAME } from "@connectors/connectors/gong/temporal/config";
import { gongCleanupExcludedTranscriptsWorkflow } from "@connectors/connectors/gong/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { normalizeError } from "@connectors/types";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

export function makeGongCleanupExcludedWorkflowId(
  connector: ConnectorResource,
  timestamp: number
): string {
  return `gong-cleanup-excluded-${connector.id}-${timestamp}`;
}

export async function launchGongCleanupExcludedTranscriptsWorkflow(
  connector: ConnectorResource,
  excludeKeywords: string[]
): Promise<Result<string, Error>> {
  if (!excludeKeywords || excludeKeywords.length === 0) {
    return new Ok("no-op");
  }

  const client = await getTemporalClient();
  const workflowId = makeGongCleanupExcludedWorkflowId(connector, Date.now());

  try {
    await client.workflow.start(gongCleanupExcludedTranscriptsWorkflow, {
      args: [{ connectorId: connector.id, excludeKeywords }],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: { connectorId: [connector.id] },
      memo: { connectorId: connector.id },
    });

    logger.info(
      {
        connectorId: connector.id,
        workflowId,
        keywordCount: excludeKeywords.length,
      },
      "[Gong] Started cleanup workflow for excluded transcripts"
    );

    return new Ok(workflowId);
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger.warn(
        { workflowId, connectorId: connector.id },
        "[Gong] Cleanup workflow already running"
      );
      return new Ok(workflowId);
    }

    logger.error(
      { connectorId: connector.id, error: e },
      "[Gong] Failed to start cleanup workflow"
    );
    return new Err(normalizeError(e));
  }
}
