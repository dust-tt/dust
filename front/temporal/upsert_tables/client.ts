import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

import { QUEUE_NAME } from "./config";
import { upsertTableWorkflow } from "./workflows";

export async function launchUpsertTableWorkflow({
  workspaceId,
  dataSourceId,
  upsertQueueId,
  enqueueTimestamp,
}: {
  workspaceId: string;
  dataSourceId: string;
  upsertQueueId: string;
  enqueueTimestamp: number;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClient();

  const workflowId = `upsert-table-queue-${workspaceId}-${dataSourceId}-${upsertQueueId}`;

  try {
    await client.workflow.start(upsertTableWorkflow, {
      args: [upsertQueueId, enqueueTimestamp],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      memo: {
        workspaceId,
        dataSourceId,
        upsertQueueId,
      },
    });
    logger.info(
      {
        workflowId,
      },
      "Started workflow."
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      "Failed starting workflow."
    );
    return new Err(e as Error);
  }
}
