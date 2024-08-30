import type { ModelId } from "@dust-tt/types";
import {
  CancelledFailure,
  executeChild,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "./activities";
import { makeProcessTranscriptWorkflowId } from "./utils";

const { retrieveNewTranscriptsActivity, processTranscriptActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "20 minutes",
  });

export async function retrieveNewTranscriptsWorkflow(
  transcriptsConfigurationId: ModelId
) {
  try {
    const filesToProcess = await retrieveNewTranscriptsActivity(
      transcriptsConfigurationId
    );

    const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

    for (const fileId of filesToProcess) {
      const workflowId = makeProcessTranscriptWorkflowId({
        transcriptsConfigurationId,
        fileId,
      });
      try {
        await executeChild(processTranscriptWorkflow, {
          workflowId,
          searchAttributes: parentSearchAttributes,
          args: [
            {
              fileId,
              transcriptsConfigurationId,
            },
          ],
          memo,
        });
      } catch (error) {
        if (error instanceof CancelledFailure) {
          console.log(`Child workflow ${workflowId} was cancelled`);
        } else {
          console.error(`Error in child workflow ${workflowId}:`, error);
          throw error;
        }
      }
    }
  } catch (error) {
    console.error("Error in retrieveNewTranscriptsWorkflow:", error);
    // Mark the workflow as failed
    throw error;
  }
}

export async function processTranscriptWorkflow({
  fileId,
  transcriptsConfigurationId,
}: {
  fileId: string;
  transcriptsConfigurationId: ModelId;
}): Promise<void> {
  try {
    await processTranscriptActivity(transcriptsConfigurationId, fileId);
  } catch (error) {
    console.error(`Error processing transcript ${fileId}:`, error);
    // Mark the workflow as failed
    throw error;
  }
}
