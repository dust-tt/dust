import { runOnRedis } from "@app/lib/api/redis";

const REDIS_ORIGIN = "metronome_user_block" as const;

function buildKey(workspaceId: string, userId: string): string {
  return `metronome:user_block:${workspaceId}:${userId}`;
}

export async function setUserBlocked(
  workspaceId: string,
  userId: string
): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
    await client.set(buildKey(workspaceId, userId), "1");
  });
}

export async function isUserBlocked(
  workspaceId: string,
  userId: string
): Promise<boolean> {
  return runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
    const value = await client.get(buildKey(workspaceId, userId));
    return value === "1";
  });
}

export async function clearUserBlocked(
  workspaceId: string,
  userId: string
): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
    await client.del(buildKey(workspaceId, userId));
  });
}
