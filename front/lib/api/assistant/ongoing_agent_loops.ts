import { getRedisStreamClient } from "@app/lib/api/redis";
import type { OngoingAgentLoopType } from "@app/types/api/assistant/conversation/types";

type OngoingAgentLoopRegistryIdentity = {
  workspaceId: string;
  userId: string;
};

export type OngoingAgentLoopRegistryEntry = OngoingAgentLoopRegistryIdentity &
  OngoingAgentLoopType;

function registryKey({
  workspaceId,
  userId,
}: OngoingAgentLoopRegistryIdentity): string {
  return `ongoing_agent_loops:${workspaceId}:${userId}`;
}

/**
 * @cc [owner:id13,label:concurrency;performance] ongoing-agent-loop-registry-upsert
 * Each message MUST occupy one field in the workspace-user hash. Repeated upserts MUST converge on
 * the latest conversation-message pair.
 */
export async function upsertOngoingAgentLoop(
  entry: OngoingAgentLoopRegistryEntry
): Promise<void> {
  const redis = await getRedisStreamClient({ origin: "agent_loop_registry" });
  await redis.hSet(registryKey(entry), entry.messageId, entry.conversationId);
}

/**
 * @cc [owner:id13,label:concurrency;performance] ongoing-agent-loop-registry-delete
 * Deleting the same message repeatedly MUST remain safe so Temporal cleanup can be retried.
 */
export async function deleteOngoingAgentLoop({
  workspaceId,
  userId,
  messageId,
}: Omit<OngoingAgentLoopRegistryEntry, "conversationId">): Promise<void> {
  const redis = await getRedisStreamClient({ origin: "agent_loop_registry" });
  await redis.hDel(registryKey({ workspaceId, userId }), messageId);
}

export async function listOngoingAgentLoops(
  identity: OngoingAgentLoopRegistryIdentity
): Promise<OngoingAgentLoopType[]> {
  const redis = await getRedisStreamClient({ origin: "agent_loop_registry" });
  const entries = await redis.hGetAll(registryKey(identity));

  return Object.entries(entries)
    .map(([messageId, conversationId]) => ({ conversationId, messageId }))
    .sort((a, b) => a.messageId.localeCompare(b.messageId));
}
