import {
  agentMentionsCount,
  storeCountsInRedis,
} from "@app/lib/api/assistant/agent_usage";
import { runOnRedis } from "@app/lib/api/redis";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";

export async function mentionsCountActivity(workspaceId: string) {
  const owner = await WorkspaceResource.fetchById(workspaceId);
  if (!owner) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  const agentMessageCounts = await agentMentionsCount(owner.sId);

  await runOnRedis({ origin: "mentions_count" }, (redis) =>
    storeCountsInRedis(workspaceId, agentMessageCounts, redis)
  );
}
