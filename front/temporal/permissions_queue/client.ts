import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/permissions_queue/config";
import { updateSpacePermissionsWorkflow } from "@app/temporal/permissions_queue/workflows";

export async function launchUpdateSpacePermissionsWorkflow(
  auth: Authenticator,
  space: SpaceResource
): Promise<Result<undefined, Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const spaceId = space.sId;

  const workflowId = `workflow-update-space-permissions-${workspaceId}-${spaceId}`;

  const client = await getTemporalClient();

  try {
    await client.workflow.start(updateSpacePermissionsWorkflow, {
      args: [{ spaceId, workspaceId }],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      memo: {
        spaceId,
        workspaceId,
      },
    });

    logger.info(
      {
        workflowId,
      },
      "Started usage workflow."
    );

    return new Ok(undefined);
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger.error(
        {
          workflowId,
          error: e,
        },
        "Failed starting usage workflow."
      );
    }
    return new Err(e as Error);
  }
}
