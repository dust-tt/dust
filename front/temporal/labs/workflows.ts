import type { ModelId } from "@dust-tt/types";
import type { LabsTranscriptsProviderType } from "@dust-tt/types";
import {
  executeChild,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";

import { Workspace } from "@app/lib/models/workspace";

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
  const workspace = await Workspace.findOne({
    where: {
      id: workspaceId,
    },
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const filesToProcess = await retrieveNewTranscriptsActivity(
    userId,
    workspace.sId,
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
  const workspace = await Workspace.findOne({
    where: {
      id: workspaceId,
    },
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }
  await processGoogleDriveTranscriptActivity(userId, workspace.sId, fileId);
}
