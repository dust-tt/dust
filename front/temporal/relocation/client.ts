import type { ModelId } from "@dust-tt/types";

import type { RegionType } from "@app/lib/api/regions/config";
import { RELOCATION_QUEUES_PER_REGION } from "@app/temporal/relocation/config";
import { getTemporalRelocationClient } from "@app/temporal/relocation/temporal";
import { workspaceRelocationWorkflow } from "@app/temporal/relocation/workflows";

export async function launchWorkspaceRelocationWorkflow({
  workspaceId,
  sourceRegion,
  targetRegion,
}: {
  workspaceId: ModelId;
  sourceRegion: RegionType;
  targetRegion: RegionType;
}) {
  const client = await getTemporalRelocationClient();

  await client.workflow.start(workspaceRelocationWorkflow, {
    args: [{ workspaceId, sourceRegion, targetRegion }],
    taskQueue: RELOCATION_QUEUES_PER_REGION[sourceRegion],
    workflowId: `relocate-workspace-${workspaceId}`,
  });
}
