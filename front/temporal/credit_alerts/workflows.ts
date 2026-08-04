import type * as activities from "@app/temporal/credit_alerts/activities";
import {
  executeChild,
  log,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";

const { sendCreditAlertEmailActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

const { getWorkspacesWithExpiredPoolCapOverrideActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "2 minutes",
});

const { expireWorkspacePoolCapOverridesActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "2 minutes",
  // Safe to let the next hourly tick pick a workspace back up, so fail fast
  // instead of retrying indefinitely.
  retry: { maximumAttempts: 1 },
});

export interface CreditAlertWorkflowArgs {
  workspaceId: string;
  totalInitialMicroUsd: number;
  totalConsumedMicroUsd: number;
}

export async function creditAlertWorkflow({
  workspaceId,
  totalInitialMicroUsd,
  totalConsumedMicroUsd,
}: CreditAlertWorkflowArgs): Promise<void> {
  await sendCreditAlertEmailActivity({
    workspaceId,
    totalInitialMicroUsd,
    totalConsumedMicroUsd,
  });
}

export async function expirePoolCapOverridesWorkflow(): Promise<void> {
  const workspaceIds = await getWorkspacesWithExpiredPoolCapOverrideActivity();
  const { workflowId } = workflowInfo();

  // allSettled, not all: each child now fails when it can't keep Metronome
  // and the DB in sync for its workspace, and one workspace's failure must
  // not take down (or terminate, via default ParentClosePolicy) the
  // still-running children for other workspaces.
  const results = await Promise.allSettled(
    workspaceIds.map((workspaceId) =>
      executeChild(expireWorkspacePoolCapOverridesWorkflow, {
        workflowId: `${workflowId}/workspace-${workspaceId}`,
        args: [workspaceId],
      })
    )
  );

  const failedCount = results.filter(
    (result) => result.status === "rejected"
  ).length;
  if (failedCount > 0) {
    log.warn(
      "[SpendLimitExpiration] Some per-workspace pool cap override sweeps failed; next hourly tick will retry",
      { failedCount, total: workspaceIds.length }
    );
  }
}

export async function expireWorkspacePoolCapOverridesWorkflow(
  workspaceId: string
): Promise<void> {
  await expireWorkspacePoolCapOverridesActivity(workspaceId);
}
