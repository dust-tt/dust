import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { TRANSCRIPTS_QUEUE_NAME } from "@app/temporal/labs/transcripts/config";
import { makeRetrieveTranscriptWorkflowId } from "@app/temporal/labs/transcripts/utils";
import { retrieveNewTranscriptsWorkflow } from "@app/temporal/labs/transcripts/workflows";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

export async function launchRetrieveTranscriptsWorkflow(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource
): Promise<Result<string, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeRetrieveTranscriptWorkflowId(transcriptsConfiguration);

  try {
    await client.workflow.start(retrieveNewTranscriptsWorkflow, {
      args: [{ transcriptsConfigurationId: transcriptsConfiguration.sId }],
      taskQueue: TRANSCRIPTS_QUEUE_NAME,
      workflowId: workflowId,
      cronSchedule: "*/5 * * * *",
      memo: {
        transcriptsConfigurationId: transcriptsConfiguration.id,
        transcriptsConfigurationSid: transcriptsConfiguration.sId,
        IsProcessingTranscripts: transcriptsConfiguration.isActive,
        IsStoringTranscripts:
          transcriptsConfiguration.dataSourceViewId !== null,
      },
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
    return new Err(normalizeError(e));
  }
}

export async function stopRetrieveTranscriptsWorkflow(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource,
  setIsActiveToFalse: boolean = true
): Promise<Result<void, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeRetrieveTranscriptWorkflowId(transcriptsConfiguration);

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
    if (setIsActiveToFalse) {
      await transcriptsConfiguration.setIsActive(false);
    }
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      "Failed stopping workflow."
    );
    return new Err(normalizeError(e));
  }
}
