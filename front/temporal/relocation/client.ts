import type { RegionType } from "@app/lib/api/regions/config";
import type {
  CreateDataSourceProjectResult,
  DataSourceCoreIds,
} from "@app/temporal/relocation/activities/types";
import { RELOCATION_QUEUES_PER_REGION } from "@app/temporal/relocation/config";
import { getTemporalRelocationClient } from "@app/temporal/relocation/temporal";
import {
  workspaceRelocateCoreDataSourceResourcesWorkflow,
  workspaceRelocationWorkflow,
} from "@app/temporal/relocation/workflows";

export async function launchWorkspaceRelocationWorkflow({
  workspaceId,
  sourceRegion,
  destRegion,
}: {
  workspaceId: string;
  sourceRegion: RegionType;
  destRegion: RegionType;
}) {
  const client = await getTemporalRelocationClient();

  await client.workflow.start(workspaceRelocationWorkflow, {
    args: [{ workspaceId, sourceRegion, destRegion }],
    taskQueue: RELOCATION_QUEUES_PER_REGION[sourceRegion],
    workflowId: `relocate-workspace-${workspaceId}`,
  });
}

export async function launchCoreDataSourceRelocationWorkflow({
  dataSourceCoreIds,
  destIds,
  destRegion,
  pageCursor,
  sourceRegion,
  workspaceId,
}: {
  dataSourceCoreIds: DataSourceCoreIds;
  destIds: CreateDataSourceProjectResult;
  destRegion: RegionType;
  pageCursor: string | null;
  sourceRegion: RegionType;
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
          destRegion,
          pageCursor,
          sourceRegion,
          workspaceId,
        },
      ],
      taskQueue: RELOCATION_QUEUES_PER_REGION[sourceRegion],
    }
  );
}
