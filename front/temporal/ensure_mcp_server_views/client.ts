import { invalidateGlobalFeatureFlagsCache } from "@app/lib/auth";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
  WorkflowExecutionAlreadyStartedError,
} from "@temporalio/client";

import {
  ENSURE_MCP_SERVER_VIEWS_SCHEDULE_ID,
  ENSURE_MCP_SERVER_VIEWS_WORKFLOW_ID,
  QUEUE_NAME,
} from "./config";
import type { EnsureMCPServerViewsWorkflowArgs } from "./workflows";
import { ensureMCPServerViewsWorkflow } from "./workflows";

export async function launchEnsureMCPServerViewsWorkflow(
  args: Omit<
    EnsureMCPServerViewsWorkflowArgs,
    "lastProcessedWorkspaceModelId" | "summary"
  > = {}
): Promise<Result<string, Error>> {
  invalidateGlobalFeatureFlagsCache();

  const client = await getTemporalClientForFrontNamespace();
  const workflowId = ENSURE_MCP_SERVER_VIEWS_WORKFLOW_ID;

  try {
    await client.workflow.start(ensureMCPServerViewsWorkflow, {
      args: [args],
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: {
        triggeringFeature: args.triggeringFeature,
      },
    });

    logger.info(
      { workflowId, ...args },
      "[Ensure MCP Server Views] Started workflow."
    );
    return new Ok(workflowId);
  } catch (error) {
    if (error instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info(
        { workflowId, ...args },
        "[Ensure MCP Server Views] Workflow already running, treating as success."
      );
      return new Ok(workflowId);
    }

    logger.error(
      { workflowId, error },
      "[Ensure MCP Server Views] Failed starting workflow."
    );
    return new Err(normalizeError(error));
  }
}

export async function launchEnsureMCPServerViewsSchedule(): Promise<
  Result<undefined, Error>
> {
  const client = await getTemporalClientForFrontNamespace();
  const scheduleId = ENSURE_MCP_SERVER_VIEWS_SCHEDULE_ID;
  const scheduleWorkflowArgs: [] = [];
  const scheduleOptions = {
    action: {
      type: "startWorkflow" as const,
      workflowType: ensureMCPServerViewsWorkflow,
      args: scheduleWorkflowArgs,
      taskQueue: QUEUE_NAME,
      workflowId: ENSURE_MCP_SERVER_VIEWS_WORKFLOW_ID,
    },
    scheduleId,
    policies: {
      overlap: ScheduleOverlapPolicy.SKIP,
    },
    spec: {
      // Daily bounds code-removal drift to <24h while the SQL pre-filter keeps healthy runs cheap.
      cronExpressions: ["0 3 * * *"],
      timezone: "UTC",
    },
  };

  try {
    const existingSchedule = client.schedule.getHandle(scheduleId);
    await existingSchedule.update((previous) => ({
      ...scheduleOptions,
      state: previous.state,
    }));
    logger.info({ scheduleId }, "[Ensure MCP Server Views] Updated schedule.");
    return new Ok(undefined);
  } catch (error) {
    if (!(error instanceof ScheduleNotFoundError)) {
      logger.error(
        { scheduleId, error },
        "[Ensure MCP Server Views] Failed updating schedule."
      );
      return new Err(normalizeError(error));
    }
  }

  try {
    await client.schedule.create(scheduleOptions);
    logger.info({ scheduleId }, "[Ensure MCP Server Views] Created schedule.");
    return new Ok(undefined);
  } catch (error) {
    logger.error(
      { scheduleId, error },
      "[Ensure MCP Server Views] Failed creating schedule."
    );
    return new Err(normalizeError(error));
  }
}
