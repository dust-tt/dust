import {
  ParentClosePolicy,
  patched,
  proxyActivities,
  setHandler,
  sleep,
  startChild,
} from "@temporalio/workflow";

import { WORKSPACE_DEFAULT_RETENTION_DAYS } from "@app/lib/data_retention";

import type * as activities from "./activities";
import { LAST_EMAIL_BEFORE_SCRUB_IN_DAYS } from "./config";
import { runScrubFreeEndedWorkspacesSignal } from "./signals";

const { shouldStillScrubData, getWorkspaceRetentionDays } = proxyActivities<
  typeof activities
>({
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

export async function scheduleWorkspaceScrubWorkflowV2({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<boolean> {
  if (!(await shouldStillScrubData({ workspaceId }))) {
    return false;
  }

  // Patch lifecycle for dynamic retention days:
  // 1. Now: patched() allows old workflows to use WORKSPACE_DEFAULT_RETENTION_DAYS, new ones call getWorkspaceRetentionDays.
  // 2. ~5 weeks (~Feb 5th 2026): Replace patched() with deprecatePatch(), remove conditional.
  // 3. ~10 weeks (~Mar 12th 2026): Remove deprecatePatch() entirely.
  const workspaceRetentionDays = patched("dynamic-retention-days")
    ? await getWorkspaceRetentionDays({ workspaceId })
    : WORKSPACE_DEFAULT_RETENTION_DAYS;

  await pauseAllConnectors({ workspaceId });
  await pauseAllTriggers({ workspaceId });
  await sendDataDeletionEmail({
    remainingDays: workspaceRetentionDays,
    workspaceId,
    isLast: false,
  });
  await sleep(
    `${workspaceRetentionDays - LAST_EMAIL_BEFORE_SCRUB_IN_DAYS} days`
  );
  if (!(await shouldStillScrubData({ workspaceId }))) {
    return false;
  }
  await sendDataDeletionEmail({
    remainingDays: LAST_EMAIL_BEFORE_SCRUB_IN_DAYS,
    workspaceId,
    isLast: true,
  });
  await sleep(`${LAST_EMAIL_BEFORE_SCRUB_IN_DAYS} days`);
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
