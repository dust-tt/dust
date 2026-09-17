import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/frame_og/config";
import { makeGenerateFrameOgImageWorkflowId } from "@app/temporal/frame_og/helpers";
import { generateFrameOgImageWorkflow } from "@app/temporal/frame_og/workflows";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  WorkflowIdConflictPolicy,
  WorkflowIdReusePolicy,
} from "@temporalio/client";

export async function launchGenerateFrameOgImageWorkflow({
  workspaceId,
  frameId,
}: {
  workspaceId: string;
  frameId: string;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeGenerateFrameOgImageWorkflowId({
    workspaceId,
    frameId,
  });

  try {
    await client.workflow.start(generateFrameOgImageWorkflow, {
      args: [{ workspaceId, frameId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      // Republish should replace any in-flight generation for the same Frame.
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.TERMINATE_EXISTING,
      memo: { workspaceId, frameId },
    });

    logger.info(
      { workflowId, workspaceId, frameId },
      "[Frame OG] Started Frame OG image workflow"
    );

    return new Ok(undefined);
  } catch (e) {
    logger.error(
      { workflowId, workspaceId, frameId, error: e },
      "[Frame OG] Failed to start Frame OG image workflow"
    );

    return new Err(normalizeError(e));
  }
}
