import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/es_indexation/config";
import {
  makeDeleteWorkspaceSkillSearchWorkflowId,
  makeIndexSkillSearchWorkflowId,
  makeIndexUserSearchWorkflowId,
} from "@app/temporal/es_indexation/helpers";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

import { indexSkillSearchSignal, indexUserSearchSignal } from "./signals";
import {
  deleteWorkspaceSkillSearchWorkflow,
  indexSkillSearchWorkflow,
  indexUserSearchWorkflow,
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
