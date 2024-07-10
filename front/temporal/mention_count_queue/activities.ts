import { safeRedisClient } from "@app/lib/redis";
import {
  agentMentionsCount,
  storeCountsInRedis,
} from "@app/lib/api/assistant/agent_usage";
import { Workspace } from "@app/lib/models/workspace";

export async function mentionCountActivity(workspaceId: string) {
  const owner = await Workspace.findOne({ where: { sId: workspaceId } });
  if (!owner) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  const agentMessageCounts = await agentMentionsCount(owner.id);

  await safeRedisClient((redis) =>
    storeCountsInRedis(workspaceId, agentMessageCounts, redis)
  );
}
