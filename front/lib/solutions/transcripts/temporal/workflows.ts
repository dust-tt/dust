import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "./activities";

const { retrieveNewTranscriptsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

export async function retrieveNewTranscriptsWorkflow(
  userId: number,
  providerId: string
) {
  await retrieveNewTranscriptsActivity(userId, providerId);
  
}
