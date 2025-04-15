import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "./activities";

const { syncLabsConnection } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  retry: {
    maximumAttempts: 3,
  },
});

export async function syncLabsConnectionWorkflow(
  configurationId: string
): Promise<void> {
  await syncLabsConnection(configurationId);
}
