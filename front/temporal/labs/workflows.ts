import type { ModelId } from "@dust-tt/types";
import type { LabsTranscriptsProviderType } from "@dust-tt/types";
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
  userId: ModelId,
  workspaceId: ModelId,
  provider: LabsTranscriptsProviderType
) {
  const filesToProcess = await retrieveNewTranscriptsActivity(
    userId,
    workspaceId,
    provider
  );

  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  for (const fileId of filesToProcess) {
    const workflowId = makeProcessTranscriptWorkflowId({ fileId, userId });
    await executeChild(processTranscriptWorkflow, {
      workflowId,
      searchAttributes: parentSearchAttributes,
      args: [
        {
          fileId,
          userId,
          workspaceId,
        },
      ],
      memo,
    });
  }
}

export async function processTranscriptWorkflow({
  fileId,
  userId,
  workspaceId,
}: {
  fileId: string;
  userId: ModelId;
  workspaceId: ModelId;
}): Promise<void> {
  await processGoogleDriveTranscriptActivity(userId, workspaceId, fileId);
}
