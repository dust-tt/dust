import {
  continueAsNew,
  executeChild,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "./activities";
import { makeProcessTranscriptWorkflowId } from "./utils";

const TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH = 1_000;
const TEMPORAL_WORKFLOW_MAX_HISTORY_SIZE_MB = 10;

const { retrieveNewTranscriptsActivity, processTranscriptActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "20 minutes",
  });

export async function retrieveNewTranscriptsWorkflow({
  transcriptsConfigurationId,
  startIndex = 0,
}: {
  transcriptsConfigurationId: string;
  startIndex?: number;
}) {
  const filesToProcess = await retrieveNewTranscriptsActivity(
    transcriptsConfigurationId
  );

  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  for (let i = startIndex; i < filesToProcess.length; i++) {
    const hasReachedWorkflowLimits =
      workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH ||
      workflowInfo().historySize >
        TEMPORAL_WORKFLOW_MAX_HISTORY_SIZE_MB * 1024 * 1024;
    if (hasReachedWorkflowLimits) {
      await continueAsNew<typeof retrieveNewTranscriptsWorkflow>({
        transcriptsConfigurationId,
        startIndex: i,
      });
    }

    const fileId = filesToProcess[i];
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
