import type { RegionType } from "@app/lib/api/regions/config";
import { RELOCATION_QUEUES_PER_REGION } from "@app/temporal/relocation/config";
import { getTemporalRelocationClient } from "@app/temporal/relocation/temporal";
import { workspaceRelocationWorkflow } from "@app/temporal/relocation/workflows";

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
