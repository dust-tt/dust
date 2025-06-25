import {
  agentMentionsCount,
  storeCountsInRedis,
} from "@app/lib/api/assistant/agent_usage";
import { runOnRedis } from "@app/lib/api/redis";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";

export async function mentionsCountActivity(workspaceId: string) {
  const owner = await WorkspaceModel.findOne({ where: { sId: workspaceId } });
  if (!owner) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  const agentMessageCounts = await agentMentionsCount(owner.id);

  await runOnRedis({ origin: "mentions_count" }, (redis) =>
    storeCountsInRedis(workspaceId, agentMessageCounts, redis)
  );
}
