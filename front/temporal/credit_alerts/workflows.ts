import type * as activities from "@app/temporal/credit_alerts/activities";
import {
  executeChild,
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
  retry: { maximumAttempts: 2 },
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

  await Promise.all(
    workspaceIds.map((workspaceId) =>
      executeChild(expireWorkspacePoolCapOverridesWorkflow, {
        workflowId: `${workflowId}/workspace-${workspaceId}`,
        args: [workspaceId],
      })
    )
  );
}

export async function expireWorkspacePoolCapOverridesWorkflow(
  workspaceId: string
): Promise<void> {
  await expireWorkspacePoolCapOverridesActivity(workspaceId);
}
