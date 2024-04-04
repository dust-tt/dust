import { continueAsNew,proxyActivities, sleep, workflowInfo } from "@temporalio/workflow";

import type * as activities from "./activities";

const { retrieveNewTranscriptsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

export async function retrieveNewTranscriptsWorkflow(
  userId: number,
  providerId: string
) {
  const SECONDS_INTERVAL_BETWEEN_PULLS = 10;
  
  do {
    console.log("Retrieving new transcripts")
    await retrieveNewTranscriptsActivity(userId, providerId);
    console.log("FINISHED Retrieving new transcripts")
    console.log("Sleeping...")
    await sleep(SECONDS_INTERVAL_BETWEEN_PULLS * 1000);
    console.log("Done Sleeping")

    if (workflowInfo().historyLength > 4000) {
      await continueAsNew<typeof retrieveNewTranscriptsWorkflow>(
        userId,
        providerId
      );  
    }
    
  } while (workflowInfo().historyLength < 5000);
}
