import type { ModelId } from "@dust-tt/types";
import {
  executeChild,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "./activities";
import { makeProcessTranscriptWorkflowId } from "./utils";

const { retrieveNewTranscriptsActivity, processGoogleDriveTranscriptActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "20 minutes",
  });

export async function retrieveNewTranscriptsWorkflow(
  transcriptsConfigurationId: ModelId
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
  transcriptsConfigurationId: ModelId;
}): Promise<void> {
  await processGoogleDriveTranscriptActivity(
    transcriptsConfigurationId,
    fileId
  );
}
