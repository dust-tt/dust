import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

import { QUEUE_NAME } from "./config";
import {
  upsertAudioTranscriptionWorkflow,
  upsertDocumentWorkflow,
} from "./workflows";

export async function launchUpsertDocumentWorkflow({
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
  const client = await getTemporalClientForFrontNamespace();

  const workflowId = `upsert-queue-document-${workspaceId}-${dataSourceId}-${upsertQueueId}`;

  try {
    await client.workflow.start(upsertDocumentWorkflow, {
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
    return new Err(normalizeError(e));
  }
}

export async function launchUpsertAudioTranscriptionWorkflow({
  dataSourceId,
  upsertQueueId,
  workspaceId,
}: {
  dataSourceId: string;
  upsertQueueId: string;
  workspaceId: string;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClientForFrontNamespace();

  const workflowId = `upsert-queue-audio-transcription-${workspaceId}-${dataSourceId}-${upsertQueueId}`;

  try {
    await client.workflow.start(upsertAudioTranscriptionWorkflow, {
      args: [upsertQueueId],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      memo: {
        workspaceId,
        dataSourceId,
        upsertQueueId,
      },
    });

    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      "Failed starting audio transcription workflow."
    );

    return new Err(normalizeError(e));
  }
}
