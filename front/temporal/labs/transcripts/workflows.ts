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
  workspaceId,
  transcriptsConfigurationId,
}: {
  workspaceId: string;
  transcriptsConfigurationId: string;
}) {
  if (!transcriptsConfigurationId) {
    throw new Error(
      "transcriptsConfigurationId is required but was undefined or empty"
    );
  }

  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  const result = await retrieveNewTranscriptsActivity(
    transcriptsConfigurationId,
    workspaceId
  );

  const filesToProcess = result.fileIds;

  for (const fileId of filesToProcess) {
    const hasReachedWorkflowLimits =
      workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH ||
      workflowInfo().historySize >
        TEMPORAL_WORKFLOW_MAX_HISTORY_SIZE_MB * 1024 * 1024;
    if (hasReachedWorkflowLimits) {
      await continueAsNew<typeof retrieveNewTranscriptsWorkflow>({
        workspaceId,
        transcriptsConfigurationId,
      });
      return;
    }

    const workflowId = makeProcessTranscriptWorkflowId({
      workspaceId,
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
          workspaceId,
        },
      ],
      memo,
    });
  }
}

export async function processTranscriptWorkflow({
  fileId,
  transcriptsConfigurationId,
  workspaceId,
}: {
  fileId: string;
  transcriptsConfigurationId: string;
  workspaceId: string;
}): Promise<void> {
  await processTranscriptActivity(
    transcriptsConfigurationId,
    fileId,
    workspaceId
  );
}
