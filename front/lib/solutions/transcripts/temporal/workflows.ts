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
  const SECONDS_INTERVAL_BETWEEN_PULLS = 15 * 60;

  do {
    console.log("[START] Retrieving new transcripts");
    await retrieveNewTranscriptsActivity(userId, providerId);
    console.log(`Sleeping ${SECONDS_INTERVAL_BETWEEN_PULLS / 60}m...`);
    await sleep(SECONDS_INTERVAL_BETWEEN_PULLS * 1000);

    if (workflowInfo().historyLength > 4000) {
      await continueAsNew<typeof retrieveNewTranscriptsWorkflow>(
        userId,
        providerId
      );
    }
  } while (workflowInfo().historyLength < 5000);
}

export async function summarizeTranscriptWorkflow(
  userId: number,
  fileId: string
) {
  await summarizeGoogleDriveTranscriptActivity(userId, fileId);
}
