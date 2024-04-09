import {
  continueAsNew,
  proxyActivities,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "./activities";

const {
  retrieveNewTranscriptsActivity,
  summarizeGoogleDriveTranscriptActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

export async function retrieveNewTranscriptsWorkflow(
  userId: number,
  providerId: string
) {
  // 15 minutes
  const SECONDS_INTERVAL_BETWEEN_PULLS = 15 * 60;

  do {
    await retrieveNewTranscriptsActivity(userId, providerId);
    await sleep(SECONDS_INTERVAL_BETWEEN_PULLS * 1000);

    // Temporal becomes slow > 4000 lines so we need to continue as new
    if (workflowInfo().historyLength > 4000) {
      await continueAsNew<typeof retrieveNewTranscriptsWorkflow>(
        userId,
        providerId
      );
    }
  // This is to assure that the workflow will stay alive
  // Linter does not like while(true)
  } while (workflowInfo().historyLength < 5000);
}

export async function summarizeTranscriptWorkflow(
  userId: number,
  fileId: string
) {
  await summarizeGoogleDriveTranscriptActivity(userId, fileId);
}
