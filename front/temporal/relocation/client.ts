import type {
  CreateDataSourceProjectResult,
  DataSourceCoreIds,
} from "@app/temporal/relocation/activities/types";
import { RELOCATION_QUEUES_PER_CELL } from "@app/temporal/relocation/config";
import { getTemporalRelocationClient } from "@app/temporal/relocation/temporal";
import {
  workspaceRelocateCoreDataSourceResourcesWorkflow,
  workspaceRelocationWorkflow,
} from "@app/temporal/relocation/workflows";
import type { CellType } from "@app/types/cell";

export async function launchWorkspaceRelocationWorkflow({
  workspaceId,
  sourceCell,
  destCell,
}: {
  workspaceId: string;
  sourceCell: CellType;
  destCell: CellType;
}) {
  const client = await getTemporalRelocationClient();

  await client.workflow.start(workspaceRelocationWorkflow, {
    args: [{ workspaceId, sourceCell, destCell }],
    taskQueue: RELOCATION_QUEUES_PER_CELL[sourceCell],
    workflowId: `relocate-workspace-${workspaceId}`,
  });
}

export async function launchCoreDataSourceRelocationWorkflow({
  dataSourceCoreIds,
  destIds,
  destCell,
  pageCursor,
  sourceCell,
  workspaceId,
}: {
  dataSourceCoreIds: DataSourceCoreIds;
  destIds: CreateDataSourceProjectResult;
  destCell: CellType;
  pageCursor: string | null;
  sourceCell: CellType;
  workspaceId: string;
}) {
  const client = await getTemporalRelocationClient();

  const workflowId = `workspaceRelocateCoreDataSourceResourcesWorkflow-${workspaceId}-${
    dataSourceCoreIds.dustAPIDataSourceId
  }`;

  await client.workflow.start(
    workspaceRelocateCoreDataSourceResourcesWorkflow,
    {
      workflowId,
      args: [
        {
          dataSourceCoreIds,
          destIds,
          destCell,
          pageCursor,
          sourceCell,
          workspaceId,
        },
      ],
      taskQueue: RELOCATION_QUEUES_PER_CELL[sourceCell],
    }
  );
}
