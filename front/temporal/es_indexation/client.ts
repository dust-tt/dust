import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/es_indexation/config";
import {
  makeDeleteWorkspaceAgentSearchWorkflowId,
  makeDeleteWorkspaceSkillSearchWorkflowId,
  makeIndexAgentSearchWorkflowId,
  makeIndexSkillSearchWorkflowId,
  makeIndexUserSearchWorkflowId,
} from "@app/temporal/es_indexation/helpers";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  ScheduleAlreadyRunning,
  ScheduleOverlapPolicy,
} from "@temporalio/client";

import {
  indexAgentSearchSignal,
  indexSkillSearchSignal,
  indexUserSearchSignal,
} from "./signals";
import {
  deleteWorkspaceAgentSearchWorkflow,
  deleteWorkspaceSkillSearchWorkflow,
  indexAgentSearchWorkflow,
  indexSkillSearchWorkflow,
  indexUserSearchWorkflow,
  refreshSearchUsageWorkflow,
  refreshWorkspaceSearchUsageWorkflow,
} from "./workflows";

export async function launchIndexUserSearchWorkflow({
  userId,
}: {
  userId: string;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();

  const workflowId = makeIndexUserSearchWorkflowId({ userId });

  try {
    await client.workflow.signalWithStart(indexUserSearchWorkflow, {
      args: [{ userId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      signal: indexUserSearchSignal,
      signalArgs: undefined,
      memo: {
        userId,
      },
    });
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        workflowId,
        userId,
        error: e,
      },
      "Failed starting index user workflow"
    );

    return new Err(normalizeError(e));
  }
}

export async function launchIndexSkillSearchWorkflow({
  workspaceId,
  skillId,
}: {
  workspaceId: string;
  skillId: string;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeIndexSkillSearchWorkflowId({ workspaceId, skillId });

  try {
    await client.workflow.signalWithStart(indexSkillSearchWorkflow, {
      args: [{ workspaceId, skillId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      signal: indexSkillSearchSignal,
      signalArgs: undefined,
      memo: {
        workspaceId,
        skillId,
      },
    });
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      { workflowId, workspaceId, skillId, error: e },
      "Failed starting index skill workflow"
    );

    return new Err(normalizeError(e));
  }
}

export async function launchDeleteWorkspaceSkillSearchWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeDeleteWorkspaceSkillSearchWorkflowId({ workspaceId });

  try {
    await client.workflow.start(deleteWorkspaceSkillSearchWorkflow, {
      args: [{ workspaceId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: { workspaceId },
    });
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      { workflowId, workspaceId, error: e },
      "Failed starting workspace skill index deletion workflow"
    );

    return new Err(normalizeError(e));
  }
}

export async function launchSearchUsageSchedule(): Promise<
  Result<undefined, Error>
> {
  const client = await getTemporalClientForFrontNamespace();
  try {
    await client.schedule.create({
      scheduleId: "search-usage-daily",
      action: {
        type: "startWorkflow",
        workflowType: refreshSearchUsageWorkflow,
        args: [],
        taskQueue: QUEUE_NAME,
      },
      spec: { calendars: [{ hour: 3, minute: 0 }], timezone: "UTC" },
      policies: { overlap: ScheduleOverlapPolicy.SKIP },
    });
  } catch (error) {
    if (!(error instanceof ScheduleAlreadyRunning)) {
      return new Err(normalizeError(error));
    }
  }
  return new Ok(undefined);
}

export async function launchIndexAgentSearchWorkflow({
  workspaceId,
  agentId,
}: {
  workspaceId: string;
  agentId: string;
}): Promise<Result<undefined, Error>> {
  const workflowId = makeIndexAgentSearchWorkflowId({ workspaceId, agentId });
  try {
    const client = await getTemporalClientForFrontNamespace();
    await client.workflow.signalWithStart(indexAgentSearchWorkflow, {
      args: [{ workspaceId, agentId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      signal: indexAgentSearchSignal,
      signalArgs: undefined,
      memo: { workspaceId, agentId },
    });
    return new Ok(undefined);
  } catch (error) {
    logger.error(
      { workflowId, workspaceId, agentId, error },
      "Failed starting index agent workflow"
    );
    return new Err(normalizeError(error));
  }
}

export async function launchDeleteWorkspaceAgentSearchWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<undefined, Error>> {
  const workflowId = makeDeleteWorkspaceAgentSearchWorkflowId({ workspaceId });
  try {
    const client = await getTemporalClientForFrontNamespace();
    await client.workflow.start(deleteWorkspaceAgentSearchWorkflow, {
      args: [{ workspaceId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: { workspaceId },
    });
    return new Ok(undefined);
  } catch (error) {
    logger.error(
      { workflowId, workspaceId, error },
      "Failed starting workspace agent index deletion workflow"
    );
    return new Err(normalizeError(error));
  }
}

export async function launchWorkspaceSearchUsageWorkflow(
  workspaceId: string
): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  try {
    await client.workflow.start(refreshWorkspaceSearchUsageWorkflow, {
      workflowId: `search-usage-${workspaceId}`,
      args: [{ workspaceId }],
      taskQueue: QUEUE_NAME,
    });
  } catch (error) {
    return new Err(normalizeError(error));
  }
  return new Ok(undefined);
}
