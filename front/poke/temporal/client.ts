import type { LightWorkspaceType } from "@dust-tt/types";
import { Err } from "@dust-tt/types";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import type { Authenticator } from "@app/lib/auth";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";

import {
  deleteWorkspaceWorkflow,
  scrubDataSourceWorkflow,
  scrubSpaceWorkflow,
} from "./workflows";

export async function launchScrubDataSourceWorkflow(
  owner: LightWorkspaceType,
  dataSource: DataSourceResource
) {
  const client = await getTemporalClient();

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
    return new Err(e as Error);
  }
}

export async function launchScrubSpaceWorkflow(
  auth: Authenticator,
  space: SpaceResource
) {
  const client = await getTemporalClient();
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
}: {
  workspaceId: string;
}) {
  const client = await getTemporalClient();

  await client.workflow.start(deleteWorkspaceWorkflow, {
    args: [
      {
        workspaceId,
      },
    ],
    taskQueue: "poke-queue",
    workflowId: `poke-${workspaceId}-delete-workspace`,
  });
}
