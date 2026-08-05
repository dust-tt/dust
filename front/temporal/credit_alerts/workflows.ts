import type * as activities from "@app/temporal/credit_alerts/activities";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";
import {
  log,
  ParentClosePolicy,
  proxyActivities,
  startChild,
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

  // Naive fan-out: just start each per-workspace sweep and move on.
  //
  // The workflowId is scoped only by workspaceId (not by this run), so if a
  // previous tick's sweep for the same workspace is still running, this
  // tick skips it instead of starting a second, concurrent sweep over the
  // same memberships.
  for (const workspaceId of workspaceIds) {
    try {
      await startChild(expireWorkspacePoolCapOverridesWorkflow, {
        workflowId: `expire-pool-cap-overrides-workspace-${workspaceId}`,
        args: [workspaceId],
        parentClosePolicy: ParentClosePolicy.ABANDON,
      });
    } catch (err) {
      if (!(err instanceof WorkflowExecutionAlreadyStartedError)) {
        throw err;
      }
      log.info(
        "[SpendLimitExpiration] Sweep already running for this workspace; skipping",
        { workspaceId }
      );
    }
  }
}

export async function expireWorkspacePoolCapOverridesWorkflow(
  workspaceId: string
): Promise<void> {
  await expireWorkspacePoolCapOverridesActivity(workspaceId);
}
