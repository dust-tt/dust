import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/permissions_queue/config";
import type { UpdateSpacePermissionsSignal } from "@app/temporal/permissions_queue/signals";
import { updateSpacePermissionsSignal } from "@app/temporal/permissions_queue/signals";
import { updateSpacePermissionsWorkflow } from "@app/temporal/permissions_queue/workflows";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

const DEBOUNCE_MS = 10 * 1000; // 10 seconds.

export async function launchUpdateSpacePermissionsWorkflow(
  auth: Authenticator,
  space: SpaceResource
): Promise<Result<undefined, Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const spaceId = space.sId;

  const workflowId = `workflow-update-space-permissions-${workspaceId}-${spaceId}`;

  const client = await getTemporalClient();

  const signalArgs: UpdateSpacePermissionsSignal[] = [
    {
      debounceMs: DEBOUNCE_MS,
    },
  ];

  try {
    await client.workflow.signalWithStart(updateSpacePermissionsWorkflow, {
      args: [{ debounceMs: DEBOUNCE_MS, spaceId, workspaceId }],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      memo: {
        spaceId,
        workspaceId,
      },
      signal: updateSpacePermissionsSignal,
      signalArgs: [signalArgs],
    });

    logger.info(
      {
        workflowId,
      },
      "Started update space permissions workflow."
    );

    return new Ok(undefined);
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger.error(
        {
          workflowId,
          error: e,
        },
        "Failed to start update space permissions workflow."
      );
    }

    return new Err(e as Error);
  }
}
