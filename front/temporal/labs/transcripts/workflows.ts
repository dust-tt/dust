import {
  executeChild,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "./activities";
import { makeProcessTranscriptWorkflowId } from "./utils";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";

const { retrieveNewTranscriptsActivity, processTranscriptActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "20 minutes",
  });

export async function retrieveNewTranscriptsWorkflow(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource
) {
  const filesToProcess = await retrieveNewTranscriptsActivity(
    transcriptsConfiguration.sId
  );

  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  for (const fileId of filesToProcess) {
    const workflowId = makeProcessTranscriptWorkflowId({
      transcriptsConfiguration,
      fileId,
    });
    const transcriptsConfigurationId = transcriptsConfiguration.sId;
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
