import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/labs/config";
import { makeRetrieveTranscriptWorkflowId } from "@app/temporal/labs/utils";
import { retrieveNewTranscriptsWorkflow } from "@app/temporal/labs/workflows";

export async function launchRetrieveTranscriptsWorkflow(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource
): Promise<Result<string, Error>> {
  const client = await getTemporalClient();
  const workflowId = makeRetrieveTranscriptWorkflowId(transcriptsConfiguration);

  try {
    await client.workflow.start(retrieveNewTranscriptsWorkflow, {
      args: [transcriptsConfiguration.id],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      cronSchedule: "*/15 * * * *",
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

export async function stopRetrieveTranscriptsWorkflow(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
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
    await transcriptsConfiguration.setIsActive(false);
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      "Failed stopping workflow."
    );
    return new Err(e as Error);
  }
}
