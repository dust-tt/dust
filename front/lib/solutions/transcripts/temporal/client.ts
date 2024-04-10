import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import { QUEUE_NAME } from "@app/lib/solutions/transcripts/temporal/config";
import {
  processTranscriptWorkflow,
  retrieveNewTranscriptsWorkflow,
} from "@app/lib/solutions/transcripts/temporal/workflows";
import type { SolutionsTranscriptsProviderType } from "@app/lib/solutions/transcripts/utils/types";
import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";

export function generateWorkflowId(userId: string, providerId: SolutionsTranscriptsProviderType): string {
  return `solutions-transcripts-retrieve-u${userId}-${providerId}`;
}

export async function launchRetrieveNewTranscriptsWorkflow({
  userId,
  providerId,
}: {
  userId: number;
  providerId: SolutionsTranscriptsProviderType
}): Promise<Result<string, Error>> {
  const client = await getTemporalClient();
  const workflowId = generateWorkflowId(userId.toString(), providerId);

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

export async function launchProcessTranscriptWorkflow({
  userId,
  fileId,
}: {
  userId: number;
  fileId: string;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClient();

  const workflowId = `solutions-transcripts-processing-u${userId}-f${fileId}`;

  try {
    await client.workflow.start(processTranscriptWorkflow, {
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
