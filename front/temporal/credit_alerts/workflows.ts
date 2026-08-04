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
  // Fail fast after a couple of attempts: this child workflow then closes,
  // freeing up its workspace-scoped workflowId so the next hourly tick's
  // `startChild` call picks the workspace back up in a fresh child instead
  // of this one retrying indefinitely.
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

  // Naive fan-out: just start each per-workspace sweep and move on. Abandon
  // detaches the children from this workflow's lifecycle, and each child
  // fails on its own after a couple of attempts (see the activity's retry
  // policy above) instead of this workflow waiting on or tracking their
  // outcome.
  //
  // The workflowId is scoped only by workspaceId (not by this run), so if a
  // previous tick's sweep for the same workspace is still running, this
  // tick skips it instead of starting a second, concurrent sweep over the
  // same memberships. Once that sweep closes (success or failure), the next
  // tick is free to start a new one for the same workspace.
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
