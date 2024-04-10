import {
  continueAsNew,
  proxyActivities,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

// import { SolutionsTranscriptsConfigurationResource } from "@app/lib/resources/solutions_transcripts_configuration_resource";
import type { SolutionsTranscriptsProviderType } from "@app/lib/solutions/transcripts/utils/types";

import type * as activities from "./activities";

const {
  retrieveNewTranscriptsActivity,
  processGoogleDriveTranscriptActivity,
  checkIsActiveActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

export async function retrieveNewTranscriptsWorkflow(
  userId: number,
  providerId: SolutionsTranscriptsProviderType
) {
  // 15 minutes
  const SECONDS_INTERVAL_BETWEEN_PULLS = 10;

  const isWorkflowActive = true;

  while (isWorkflowActive) {
    if ((await checkIsActiveActivity({ userId, providerId })) !== true) {
      break;
    }
    await retrieveNewTranscriptsActivity(userId, providerId);
    await sleep(SECONDS_INTERVAL_BETWEEN_PULLS * 1000);

    // Temporal becomes slow > 4000 lines so we need to continue as new
    if (workflowInfo().historyLength > 4000) {
      await continueAsNew<typeof retrieveNewTranscriptsWorkflow>(
        userId,
        providerId
      );
    }
  }
}

export async function processTranscriptWorkflow(
  userId: number,
  fileId: string
) {
  await processGoogleDriveTranscriptActivity(userId, fileId);
}
