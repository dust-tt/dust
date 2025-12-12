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
  modjoCursor = null,
  modjoIsFirstSync = null,
}: {
  workspaceId: string;
  transcriptsConfigurationId: string;
  modjoCursor?: number | null;
  modjoIsFirstSync?: boolean | null; // null = auto-detect, true/false = preserve across continueAsNew
}) {
  if (!transcriptsConfigurationId) {
    throw new Error(
      "transcriptsConfigurationId is required but was undefined or empty"
    );
  }

  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  const result = await retrieveNewTranscriptsActivity({
    modjoCursor,
    modjoIsFirstSync,
    transcriptsConfigurationId,
    workspaceId,
  });

  const filesToProcess = result.fileIds;
  const nextCursor = result.nextCursor;
  const isFirstSync = result.isFirstSync;

  for (const fileId of filesToProcess) {
    const hasReachedWorkflowLimits =
      workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH ||
      workflowInfo().historySize >
        TEMPORAL_WORKFLOW_MAX_HISTORY_SIZE_MB * 1024 * 1024;
    if (hasReachedWorkflowLimits) {
      await continueAsNew<typeof retrieveNewTranscriptsWorkflow>({
        workspaceId,
        transcriptsConfigurationId,
        modjoCursor,
        modjoIsFirstSync: isFirstSync,
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

  if (nextCursor !== null) {
    await continueAsNew<typeof retrieveNewTranscriptsWorkflow>({
      workspaceId,
      transcriptsConfigurationId,
      modjoCursor: nextCursor,
      modjoIsFirstSync: isFirstSync,
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
  await processTranscriptActivity({
    fileId,
    transcriptsConfigurationId,
    workspaceId,
  });
}
