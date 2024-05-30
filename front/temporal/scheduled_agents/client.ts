import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { WorkflowNotFoundError } from "@temporalio/common";

import { ScheduledAgentResource } from "@app/lib/resources/scheduled_agent_resource";
import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/scheduled_agents/config";
import { scheduleAgentWorkflow } from "@app/temporal/scheduled_agents/workflows";

export async function launchScheduleAgentWorkflow({
  scheduledAgentId,
}: {
  scheduledAgentId: string;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClient();
  const workflowId = getWorkflowId(scheduledAgentId);

  const scheduledAgent = await ScheduledAgentResource.getBySid(
    scheduledAgentId
  );
  if (!scheduledAgent) {
    return new Err(new Error(`Scheduled agent not found.`));
  }
  const workspace = await scheduledAgent.getWorkspace();
  if (!workspace) {
    return new Err(new Error(`Workspace not found.`));
  }

  try {
    await client.workflow.start(scheduleAgentWorkflow, {
      args: [{ scheduledAgentId }],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      memo: {
        workspaceId: workspace.sId,
      },
    });
    logger.info(
      {
        workflowId,
      },
      `Started workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      `Failed starting workflow.`
    );
    return new Err(e as Error);
  }
}

export async function terminateScheduleAgentWorkflow({
  scheduledAgentId,
}: {
  scheduledAgentId: string;
}): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const workflowId = getWorkflowId(scheduledAgentId);

  try {
    const handle = await client.workflow.getHandle(workflowId);
    await handle.terminate();
    logger.info(
      {
        workflowId,
      },
      `Terminated workflow.`
    );
    return new Ok(undefined);
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      return new Ok(undefined);
    }
    logger.error(
      {
        workflowId,
        error: e,
      },
      `Failed terminating workflow.`
    );
    return new Err(e as Error);
  }
}

function getWorkflowId(scheduledAgentId: string) {
  return `schedule-agent-${scheduledAgentId}`;
}
