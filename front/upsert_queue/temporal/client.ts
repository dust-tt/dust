import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";

import { QUEUE_NAME } from "./config";
import { upsertDocumentWorkflow } from "./workflows";

export async function launchUpsertDocumentWorkflow(
  workspaceId: string,
  dataSourceName: string,
  upsertQueueId: string
): Promise<Result<string, Error>> {
  const client = await getTemporalClient();

  const workflowId = `upsert-queue-document-${workspaceId}-${dataSourceName}-${upsertQueueId}`;

  try {
    await client.workflow.start(upsertDocumentWorkflow, {
      args: [upsertQueueId],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      memo: {
        workspaceId,
        dataSourceName,
        upsertQueueId,
      },
    });
    logger.info(
      {
        workflowId,
      },
      `Started workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      `Failed starting workflow.`
    );
    return new Err(e as Error);
  }
}
