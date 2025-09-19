import { proxyActivities, sleep } from "@temporalio/workflow";

import type * as activities from "@app/temporal/scrub_workspace/activities";

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

const { scrubWorkspaceData, pauseAllConnectors, pauseAllTriggers } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "60 minutes",
  });

export async function scheduleWorkspaceScrubWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<boolean> {
  await pauseAllConnectors({ workspaceId });
  await pauseAllTriggers({ workspaceId });
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

export async function scheduleWorkspaceScrubWorkflowV2({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<boolean> {
  return scheduleWorkspaceScrubWorkflow({ workspaceId });
}

export async function immediateWorkspaceScrubWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  await scrubWorkspaceData({ workspaceId });
}
