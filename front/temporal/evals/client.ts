import type { Authenticator } from "@app/lib/auth";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import { evalWorkflowId, QUEUE_NAME } from "@app/temporal/evals/config";
import { evalRunWorkflow } from "@app/temporal/evals/workflows";
import { WorkflowExecutionAlreadyStartedError, WorkflowIdReusePolicy } from "@temporalio/client";

export async function launchEvalRun(auth: Authenticator, runId: string): Promise<void> {
  const client = await getTemporalClientForFrontNamespace();
  try {
    await client.workflow.start(evalRunWorkflow, {
      workflowId: evalWorkflowId(auth.getNonNullableWorkspace().sId, runId),
      taskQueue: QUEUE_NAME,
      args: [auth.toJSON(), runId],
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
      // A retry of the entire parent must not recreate completed child executions.
      retry: { maximumAttempts: 1 },
      memo: { workspaceId: auth.getNonNullableWorkspace().sId, runId },
    });
  } catch (error) {
    if (!(error instanceof WorkflowExecutionAlreadyStartedError)) { throw error; }
  }
}
