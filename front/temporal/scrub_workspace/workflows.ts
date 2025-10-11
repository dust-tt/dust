import {
  ParentClosePolicy,
  proxyActivities,
  setHandler,
  sleep,
  startChild,
} from "@temporalio/workflow";

import type * as activities from "@app/temporal/scrub_workspace/activities";
import { runScrubFreeEndedWorkspacesSignal } from "@app/temporal/scrub_workspace/signals";

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

const { endSubscriptionFreeEndedWorkspacesActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
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

export async function immediateWorkspaceScrubWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  await scrubWorkspaceData({ workspaceId });
}

export async function downgradeFreeEndedWorkspacesWorkflow(): Promise<void> {
  setHandler(runScrubFreeEndedWorkspacesSignal, () => {
    // Empty handler - just receiving the signal will trigger a workflow execution.
  });

  // End the subscription status for workspaces that are free with an end date in the past.
  const { workspaceIds } = await endSubscriptionFreeEndedWorkspacesActivity();

  // For each workspace, schedule the workspace scrub workflow.
  // We start child workflows but don't wait for them since they take 15+ days to complete.
  // The abandon policy ensures they continue running after the parent completes.
  const today = new Date().toISOString().split("T")[0]; // Format: YYYY-MM-DD.
  for (const workspaceId of workspaceIds) {
    await startChild(scheduleWorkspaceScrubWorkflowV2, {
      workflowId: `scrub-workspace-${workspaceId}-${today}`,
      args: [{ workspaceId }],
      parentClosePolicy: ParentClosePolicy.ABANDON,
    });
  }
}
