import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  invalidateCacheAfterCommit,
  invalidateCacheWithRedis,
} from "@app/lib/utils/cache";
import type { ModelId } from "@app/types/shared/model_id";
import type { Transaction } from "sequelize";

// Cache identity shared with the read cache on `AgentResource`, so both address the same Redis key.
// Bump the version on any snapshot-shape change: entries have no TTL, so they outlive a deploy.
export const AGENT_RESOURCE_CACHE_ID = "agent_resource_by_id";
export const AGENT_RESOURCE_CACHE_VERSION = 2;

export type AgentResourceCacheKey = { workspaceModelId: ModelId; id: string };

export const agentResourceCacheKey = ({
  workspaceModelId,
  id,
}: AgentResourceCacheKey) => `${workspaceModelId}:${id}`;

// Standalone so write paths can invalidate without importing `AgentResource` (which transitively
// imports them via `getGlobalAgents` — a cycle). Reproduces the key `defineCachedResourceValue`
// writes; a no-op loader is fine since only the explicit `cacheId` matters here.
const invalidate = invalidateCacheWithRedis(
  (_input: AgentResourceCacheKey) => Promise.resolve(null),
  (input: AgentResourceCacheKey) =>
    `v${AGENT_RESOURCE_CACHE_VERSION}:${agentResourceCacheKey(input)}`,
  { cacheId: AGENT_RESOURCE_CACHE_ID }
);

// Invalidates the cache for one or more agents. Under a transaction the whole batch runs in a single
// after-commit hook; the Redis deletions are bounded via `concurrentExecutor` so a large batch cannot
// fan out all at once (see the `bounded-promise-all` contract).
export async function invalidateAgentResourceCaches(
  workspaceModelId: ModelId,
  ids: string[],
  transaction?: Transaction
): Promise<void> {
  const uniqueIds = [...new Set(ids)];
  const invalidateAll = async () => {
    await concurrentExecutor(
      uniqueIds,
      (id) => invalidate({ workspaceModelId, id }),
      { concurrency: 8 }
    );
  };
  if (transaction) {
    invalidateCacheAfterCommit(transaction, invalidateAll);
    return;
  }
  await invalidateAll();
}

// Single-key convenience form; delegates to the batch above.
export async function invalidateAgentResourceCache(
  workspaceModelId: ModelId,
  id: string,
  transaction?: Transaction
): Promise<void> {
  await invalidateAgentResourceCaches(workspaceModelId, [id], transaction);
}
