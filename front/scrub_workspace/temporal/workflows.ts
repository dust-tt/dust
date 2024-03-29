import { proxyActivities, sleep } from "@temporalio/workflow";

import type * as activities from "@app/scrub_workspace/temporal/activities";

const { shouldStillScrubData } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minutes",
});
const { sendDataDeletionEmail } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minutes",
  retry: {
    // We really want to avoid sending the email infinitely.
    maximumAttempts: 1,
  },
});

const { scrubWorkspaceData } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minutes",
});

export async function scheduleWorkspaceScrubWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<boolean> {
  await sendDataDeletionEmail({
    remainingDays: 15,
    workspaceId,
    isLast: false,
  });
  await sleep("12 days");
  if (!(await shouldStillScrubData({ workspaceId }))) {
    return false;
  }
  await sendDataDeletionEmail({ remainingDays: 3, workspaceId, isLast: true });
  await sleep("3 days");
  if (!(await shouldStillScrubData({ workspaceId }))) {
    return false;
  }

  await scrubWorkspaceData({ workspaceId });
  return true;
}
