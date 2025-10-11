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
    retry: {
      nonRetryableErrorTypes: ["TranscriptNonRetryableError"],
    },
  });

export async function retrieveNewTranscriptsWorkflow({
  transcriptsConfigurationId,
  startIndex = 0,
}: {
  transcriptsConfigurationId: string;
  startIndex?: number;
}) {
  if (!transcriptsConfigurationId) {
    throw new Error(
      "transcriptsConfigurationId is required but was undefined or empty"
    );
  }

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
      // Continue from where we left off to avoid OOM when processing many files
      await continueAsNew<typeof retrieveNewTranscriptsWorkflow>({
        transcriptsConfigurationId,
        startIndex: i,
      });
      return;
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
