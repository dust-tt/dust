import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/sandbox_lifecycle/config";
import {
  sandboxActivitySignal,
  sandboxLifecycleWorkflow,
} from "@app/temporal/sandbox_lifecycle/workflows";

/**
 * Generate a deterministic workflow ID for a sandbox.
 */
function getSandboxWorkflowId(serviceName: string): string {
  return `sandbox-lifecycle-${serviceName}`;
}

/**
 * Start a lifecycle workflow for a new sandbox.
 *
 * Idempotent - if workflow already exists, this is a no-op.
 */
export async function startSandboxLifecycleWorkflow(
  serviceName: string
): Promise<void> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = getSandboxWorkflowId(serviceName);

  try {
    await client.workflow.start(sandboxLifecycleWorkflow, {
      args: [{ serviceName }],
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: { serviceName },
    });

    logger.info(
      { serviceName, workflowId },
      "[sandbox-lifecycle] Started lifecycle workflow"
    );
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info(
        { serviceName, workflowId },
        "[sandbox-lifecycle] Workflow already exists (idempotent)"
      );
      return;
    }
    throw err;
  }
}

/**
 * Signal the sandbox lifecycle workflow that activity occurred.
 *
 * This resets the inactivity timer, preventing auto-pause and auto-destroy.
 * Call this whenever the sandbox is used (command executed, file operations, etc.)
 *
 * If the workflow doesn't exist (sandbox was destroyed), this is a no-op.
 */
export async function signalSandboxActivity(serviceName: string): Promise<void> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = getSandboxWorkflowId(serviceName);

  try {
    const handle = client.workflow.getHandle(workflowId);
    await handle.signal(sandboxActivitySignal);
  } catch (err) {
    // Workflow may not exist if sandbox was destroyed - that's OK
    logger.warn(
      { serviceName, workflowId, err },
      "[sandbox-lifecycle] Failed to signal workflow (may be destroyed)"
    );
  }
}
