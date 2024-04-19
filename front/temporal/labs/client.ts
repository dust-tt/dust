import type { ModelId, Result } from "@dust-tt/types";
import type { LabsTranscriptsProviderType } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/labs/config";
import {
  makeProcessTranscriptWorkflowId,
  makeRetrieveTranscriptWorkflowId,
} from "@app/temporal/labs/types";
import {
  processTranscriptWorkflow,
  retrieveNewTranscriptsWorkflow,
} from "@app/temporal/labs/workflows";

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
  const workflowId = makeRetrieveTranscriptWorkflowId({
    providerId,
    workspaceId,
    userId,
  });

  try {
    await client.workflow.start(retrieveNewTranscriptsWorkflow, {
      args: [userId, workspaceId, providerId],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      memo: {
        userId,
        providerId,
      },
      cronSchedule: "*/15 * * * *", // Every 15 minutes.
    });
    logger.info(
      {
        workflowId,
      },
      "Transcript retrieval workflow started."
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      "Transcript retrieval workflow failed."
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

  const workflowId = makeProcessTranscriptWorkflowId({
    fileId,
    userId,
  });

  try {
    await client.workflow.start(processTranscriptWorkflow, {
      args: [
        {
          userId,
          workspaceId,
          fileId,
        },
      ],
      taskQueue: QUEUE_NAME,
      workflowId,
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
      "Transcript processing workflow started."
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      "Transcript processing workflow failed."
    );
    return new Err(e as Error);
  }
}

export async function stopRetrieveTranscriptsWorkflow({
  userId,
  workspaceId,
  providerId,
}: {
  userId: ModelId;
  workspaceId: ModelId;
  providerId: LabsTranscriptsProviderType;
}): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const workflowId = makeRetrieveTranscriptWorkflowId({
    providerId,
    workspaceId,
    userId,
  });

  try {
    const handle: WorkflowHandle<typeof retrieveNewTranscriptsWorkflow> =
      client.workflow.getHandle(workflowId);
    try {
      await handle.terminate();
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
    }
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      "[Intercom] Failed stopping workflow."
    );
    return new Err(e as Error);
  }
}
