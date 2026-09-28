import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/es_indexation/config";
import {
  makeDeleteAgentSearchWorkflowId,
  makeDeleteSkillSearchWorkflowId,
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
  deleteAgentSearchWorkflow,
  deleteSkillSearchWorkflow,
  deleteWorkspaceAgentSearchWorkflow,
  deleteWorkspaceSkillSearchWorkflow,
  indexAgentSearchWorkflow,
  indexSkillSearchWorkflow,
  indexUserSearchWorkflow,
  refreshSearchUsageWorkflow,
  refreshWorkspaceSearchUsageWorkflow,
  reindexCodeDefinedSearchWorkflow,
} from "./workflows";

const SEARCH_USAGE_SCHEDULE_ID = "search-usage-daily";
const CODE_DEFINED_SEARCH_SCHEDULE_ID = "search-code-defined-hourly";

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

export async function launchDeleteSkillSearchWorkflow({
  workspaceId,
  skillId,
}: {
  workspaceId: string;
  skillId: string;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeDeleteSkillSearchWorkflowId({ workspaceId, skillId });

  try {
    await client.workflow.start(deleteSkillSearchWorkflow, {
      args: [{ workspaceId, skillId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: { workspaceId, skillId },
    });
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      { workflowId, workspaceId, skillId, error: e },
      "Failed starting skill index deletion workflow"
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

export async function launchIndexAgentSearchWorkflow({
  workspaceId,
  agentId,
}: {
  workspaceId: string;
  agentId: string;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeIndexAgentSearchWorkflowId({ workspaceId, agentId });

  try {
    await client.workflow.signalWithStart(indexAgentSearchWorkflow, {
      args: [{ workspaceId, agentId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      signal: indexAgentSearchSignal,
      signalArgs: undefined,
      memo: {
        workspaceId,
        agentId,
      },
    });
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      { workflowId, workspaceId, agentId, error: e },
      "Failed starting index agent workflow"
    );

    return new Err(normalizeError(e));
  }
}

export async function launchDeleteAgentSearchWorkflow({
  workspaceId,
  agentId,
}: {
  workspaceId: string;
  agentId: string;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeDeleteAgentSearchWorkflowId({ workspaceId, agentId });

  try {
    await client.workflow.start(deleteAgentSearchWorkflow, {
      args: [{ workspaceId, agentId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: { workspaceId, agentId },
    });
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      { workflowId, workspaceId, agentId, error: e },
      "Failed starting agent index deletion workflow"
    );

    return new Err(normalizeError(e));
  }
}

export async function launchDeleteWorkspaceAgentSearchWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeDeleteWorkspaceAgentSearchWorkflowId({ workspaceId });

  try {
    await client.workflow.start(deleteWorkspaceAgentSearchWorkflow, {
      args: [{ workspaceId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: { workspaceId },
    });
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      { workflowId, workspaceId, error: e },
      "Failed starting workspace agent index deletion workflow"
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
      scheduleId: SEARCH_USAGE_SCHEDULE_ID,
      action: {
        type: "startWorkflow",
        workflowType: refreshSearchUsageWorkflow,
        args: [],
        taskQueue: QUEUE_NAME,
      },
      spec: { calendars: [{ hour: 3, minute: 0 }], timezone: "UTC" },
      policies: { overlap: ScheduleOverlapPolicy.BUFFER_ONE },
    });
  } catch (error) {
    if (!(error instanceof ScheduleAlreadyRunning)) {
      return new Err(normalizeError(error));
    }
  }
  return new Ok(undefined);
}

export async function launchCodeDefinedSearchSchedule(): Promise<
  Result<undefined, Error>
> {
  const client = await getTemporalClientForFrontNamespace();
  try {
    await client.schedule.create({
      scheduleId: CODE_DEFINED_SEARCH_SCHEDULE_ID,
      action: {
        type: "startWorkflow",
        workflowType: reindexCodeDefinedSearchWorkflow,
        args: [],
        taskQueue: QUEUE_NAME,
      },
      spec: { cronExpressions: ["0 * * * *"], timezone: "UTC" },
      policies: { overlap: ScheduleOverlapPolicy.SKIP },
      state: { triggerImmediately: true },
    });
  } catch (error) {
    if (!(error instanceof ScheduleAlreadyRunning)) {
      return new Err(normalizeError(error));
    }
  }
  return new Ok(undefined);
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
