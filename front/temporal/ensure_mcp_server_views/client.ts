import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import { ENSURE_MCP_SERVER_VIEWS_WORKFLOW_ID, QUEUE_NAME } from "./config";
import type { EnsureMCPServerViewsWorkflowArgs } from "./workflows";
import { ensureMCPServerViewsWorkflow } from "./workflows";

export type LaunchEnsureMCPServerViewsWorkflowOutcome =
  | "started"
  | "already_running";

export type LaunchEnsureMCPServerViewsWorkflowResult = {
  workflowId: string;
  outcome: LaunchEnsureMCPServerViewsWorkflowOutcome;
};

export async function launchEnsureMCPServerViewsWorkflow(
  args: Omit<
    EnsureMCPServerViewsWorkflowArgs,
    "lastProcessedWorkspaceModelId" | "summary"
  > = {}
): Promise<Result<LaunchEnsureMCPServerViewsWorkflowResult, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = ENSURE_MCP_SERVER_VIEWS_WORKFLOW_ID;

  try {
    await client.workflow.start(ensureMCPServerViewsWorkflow, {
      args: [args],
      taskQueue: QUEUE_NAME,
      workflowId,
    });

    logger.info(
      { workflowId, ...args },
      "[Ensure MCP Server Views] Started workflow."
    );
    return new Ok({ workflowId, outcome: "started" });
  } catch (error) {
    if (error instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info(
        { workflowId, ...args },
        "[Ensure MCP Server Views] Workflow already running."
      );
      return new Ok({ workflowId, outcome: "already_running" });
    }

    logger.error(
      { workflowId, err: normalizeError(error) },
      "[Ensure MCP Server Views] Failed starting workflow."
    );
    return new Err(normalizeError(error));
  }
}
