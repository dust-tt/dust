import type { LightWorkspaceType } from "@dust-tt/types";
import { Err } from "@dust-tt/types";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import type { Authenticator } from "@app/lib/auth";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { VaultResource } from "@app/lib/resources/vault_resource";
import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";

import {
  deleteWorkspaceWorkflow,
  scrubDataSourceWorkflow,
  scrubVaultWorkflow,
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

export async function launchScrubVaultWorkflow(
  auth: Authenticator,
  vault: VaultResource
) {
  const client = await getTemporalClient();
  const owner = auth.getNonNullableWorkspace();

  await client.workflow.start(scrubVaultWorkflow, {
    args: [
      {
        vaultId: vault.sId,
        workspaceId: owner.sId,
      },
    ],
    taskQueue: "poke-queue",
    workflowId: `poke-${owner.sId}-scrub-vault-${vault.sId}`,
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
