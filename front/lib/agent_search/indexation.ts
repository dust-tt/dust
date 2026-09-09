import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  launchDeleteWorkspaceAgentSearchWorkflow,
  launchIndexAgentSearchWorkflow,
} from "@app/temporal/es_indexation/client";

export async function launchAgentsSearchIndexation({
  workspaceId,
  agentIds,
}: {
  workspaceId: string;
  agentIds: readonly string[];
}): Promise<void> {
  const results = await concurrentExecutor(
    [...new Set(agentIds)],
    (agentId) => launchIndexAgentSearchWorkflow({ workspaceId, agentId }),
    { concurrency: 8 }
  );
  const failed = results.find((result) => result.isErr());
  if (failed?.isErr()) {
    throw failed.error;
  }
}

export async function launchWorkspaceAgentSearchDeletion({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  const result = await launchDeleteWorkspaceAgentSearchWorkflow({
    workspaceId,
  });
  if (result.isErr()) {
    throw result.error;
  }
}
