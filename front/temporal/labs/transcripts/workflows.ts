import {
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
  transcriptsConfigurationId: string
) {
  const filesToProcess = await retrieveNewTranscriptsActivity(
    transcriptsConfigurationId
  );

  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  for (const fileId of filesToProcess) {
    const workflowId = makeProcessTranscriptWorkflowId({
      transcriptsConfigurationId,
      fileId,
    });
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
  }
}

export async function processTranscriptWorkflow({
  fileId,
  transcriptsConfigurationId,
}: {
  fileId: string;
  transcriptsConfigurationId: string;
}): Promise<void> {
  await processTranscriptActivity(transcriptsConfigurationId, fileId);
}
