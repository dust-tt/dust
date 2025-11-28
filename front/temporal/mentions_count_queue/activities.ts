import {
  agentMentionsCount,
  storeCountsInRedis,
} from "@app/lib/api/assistant/agent_usage";
import { runOnRedis } from "@app/lib/api/redis";

export async function mentionsCountActivity(workspaceId: string) {
  const r = await agentMentionsCount(workspaceId);

  if (r.isErr()) {
    throw r.error;
  }

  await runOnRedis({ origin: "mentions_count" }, (redis) =>
    storeCountsInRedis(workspaceId, r.value, redis)
  );
}
