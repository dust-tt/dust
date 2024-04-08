import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import { QUEUE_NAME } from "@app/lib/solutions/transcripts/temporal/config";
import {
  retrieveNewTranscriptsWorkflow,
  summarizeTranscriptWorkflow,
} from "@app/lib/solutions/transcripts/temporal/workflows";
import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";

export async function launchRetrieveNewTranscriptsWorkflow({
  userId,
  providerId,
}: {
  userId: number;
  providerId: string;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClient();

  const workflowId = `solutions-transcripts-retrieve-u${userId}-${providerId}`;

  try {
    await client.workflow.start(retrieveNewTranscriptsWorkflow, {
      args: [userId, providerId],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      memo: {
        userId,
        providerId,
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

export async function launchSummarizeTranscriptWorkflow({
  userId,
  fileId,
}: {
  userId: number;
  fileId: string;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClient();

  const workflowId = `solutions-transcripts-summarize-u${userId}-f${fileId}`;

  try {
    await client.workflow.start(summarizeTranscriptWorkflow, {
      args: [userId, fileId],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      memo: {
        userId,
        fileId,
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
