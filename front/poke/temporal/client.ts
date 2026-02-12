import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import type { Authenticator } from "@app/lib/auth";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

import {
  deleteWorkspaceWorkflow,
  scrubDataSourceWorkflow,
  scrubSpaceWorkflow,
} from "./workflows";

export async function launchScrubDataSourceWorkflow(
  owner: LightWorkspaceType,
  dataSource: DataSourceResource
) {
  const client = await getTemporalClientForFrontNamespace();

  try {
    await client.workflow.start(scrubDataSourceWorkflow, {
      args: [
        {
          dataSourceId: dataSource.sId,
          workspaceId: owner.sId,
        },
      ],
      taskQueue: "poke-queue",
      workflowId: `poke-${owner.sId}-scrub-data-source-${dataSource.sId}`,
    });
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger.error(
        {
          owner: {
            sId: owner.sId,
          },
          error: e,
        },
        "Failed starting scrub data source workflow."
      );
    }
    return new Err(normalizeError(e));
  }
}

export async function launchScrubSpaceWorkflow(
  auth: Authenticator,
  space: SpaceResource
) {
  const client = await getTemporalClientForFrontNamespace();
  const owner = auth.getNonNullableWorkspace();

  await client.workflow.start(scrubSpaceWorkflow, {
    args: [
      {
        spaceId: space.sId,
        workspaceId: owner.sId,
      },
    ],
    taskQueue: "poke-queue",
    workflowId: `poke-${owner.sId}-scrub-space-${space.sId}`,
  });
}

export async function launchDeleteWorkspaceWorkflow({
  workspaceId,
  workspaceHasBeenRelocated = false,
}: {
  workspaceId: string;
  workspaceHasBeenRelocated?: boolean;
}) {
  const client = await getTemporalClientForFrontNamespace();

  try {
    await client.workflow.start(deleteWorkspaceWorkflow, {
      args: [
        {
          workspaceId,
          workspaceHasBeenRelocated,
        },
      ],
      taskQueue: "poke-queue",
      workflowId: `poke-${workspaceId}-delete-workspace`,
    });

    return new Ok(undefined);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
