import type { ModelId } from "@dust-tt/types";
import type { LabsTranscriptsProviderType } from "@dust-tt/types";
import {
  continueAsNew,
  proxyActivities,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "./activities";

const {
  retrieveNewTranscriptsActivity,
  processGoogleDriveTranscriptActivity,
  checkIsActiveActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

export async function retrieveNewTranscriptsWorkflow(
  userId: ModelId,
  workspaceId: ModelId,
  provider: LabsTranscriptsProviderType
) {
  // 15 minutes
  const SECONDS_INTERVAL_BETWEEN_PULLS = 15 * 60;

  const isWorkflowActive = true;

  while (isWorkflowActive) {
    const isConfigurationActive = await checkIsActiveActivity({
      provider,
      userId,
      workspaceId,
    });
    if (!isConfigurationActive) {
      break;
    }

    await retrieveNewTranscriptsActivity(userId, workspaceId, provider);

    await sleep(SECONDS_INTERVAL_BETWEEN_PULLS * 1000);

    // Temporal becomes slow > 4000 lines so we need to continue as new.
    if (workflowInfo().historyLength > 4000) {
      await continueAsNew<typeof retrieveNewTranscriptsWorkflow>(
        userId,
        workspaceId,
        provider
      );
    }
  }
}

export async function processTranscriptWorkflow(
  userId: ModelId,
  workspaceId: ModelId,
  fileId: string
) {
  await processGoogleDriveTranscriptActivity(userId, workspaceId, fileId);
}
