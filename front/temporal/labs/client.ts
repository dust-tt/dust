import type { ModelId, Result } from "@dust-tt/types";
import type { LabsTranscriptsProviderType } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/labs/config";
import {
  processTranscriptWorkflow,
  retrieveNewTranscriptsWorkflow,
} from "@app/temporal/labs/workflows";

export function generateWorkflowId(
  userId: string,
  providerId: LabsTranscriptsProviderType
): string {
  return `labs-transcripts-retrieve-u${userId}-${providerId}`;
}

export async function launchRetrieveTranscriptsWorkflow({
  userId,
  workspaceId,
  providerId,
}: {
  userId: ModelId;
  workspaceId: ModelId;
  providerId: LabsTranscriptsProviderType;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClient();
  const workflowId = generateWorkflowId(userId.toString(), providerId);

  try {
    await client.workflow.start(retrieveNewTranscriptsWorkflow, {
      args: [userId, workspaceId, providerId],
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
  workspaceId,
  fileId,
}: {
  userId: ModelId;
  workspaceId: ModelId;
  fileId: string;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClient();

  const workflowId = `labs-transcripts-processing-u${userId}-f${fileId}`;

  try {
    await client.workflow.start(processTranscriptWorkflow, {
      args: [userId, workspaceId, fileId],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      memo: {
        userId,
        workspaceId,
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
