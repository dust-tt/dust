import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import { QUEUE_NAME } from "@app/lib/solutions/transcripts/temporal/config";
import { retrieveNewTranscriptsWorkflow } from "@app/lib/solutions/transcripts/temporal/workflows";
import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";

export async function launchRetrieveNewTranscriptsWorkflow({
  userId,
  providerId
}: {
  userId: number;
  providerId: string;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClient();

  const workflowId = `solutions-transcripts-${providerId}-u${userId}`;

  try {
    await client.workflow.start(retrieveNewTranscriptsWorkflow, {
      args: [userId, providerId],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      memo: {
        userId,
        providerId
      },
    });
    logger.info(
      {
        workflowId,
      },
      `Started workflow ${workflowId}.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      `Failed starting workflow ${workflowId}.`
    );
    return new Err(e as Error);
  }
}
