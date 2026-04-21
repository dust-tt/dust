import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "./activities";

const { runWakeUpActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    nonRetryableErrorTypes: ["WakeUpNonRetryableError"],
  },
});

export async function wakeUpWorkflow({
  workspaceId,
  wakeUpId,
}: {
  workspaceId: string;
  wakeUpId: string;
}): Promise<void> {
  await runWakeUpActivity({ workspaceId, wakeUpId });
}
