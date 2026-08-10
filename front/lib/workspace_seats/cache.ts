import { buildCacheWithRedisKey } from "@app/lib/utils/cache";
import { defineDeferredCache } from "@app/lib/utils/cache_handle";
import { defineCacheOperations } from "@app/lib/utils/cache_operations";
import type { Transaction } from "sequelize";
import { z } from "zod";

const WORKSPACE_ACTIVE_SEATS_CACHE_TTL_MS = 5 * 60 * 1000;
const WORKSPACE_ACTIVE_SEATS_CACHE_ID = "workspace_active_seats";
const workspaceActiveSeatsCacheKey = (workspaceId: string) =>
  `count-active-seats-in-workspace:${workspaceId}`;

const workspaceActiveSeatsCache = defineDeferredCache<
  { workspaceId: string },
  number
>({
  id: WORKSPACE_ACTIVE_SEATS_CACHE_ID,
  key: ({ workspaceId }) => workspaceActiveSeatsCacheKey(workspaceId),
  ttlMs: WORKSPACE_ACTIVE_SEATS_CACHE_TTL_MS,
  cacheNullValues: false,
});

export const workspaceActiveSeatsCacheOperations = defineCacheOperations({
  id: WORKSPACE_ACTIVE_SEATS_CACHE_ID,
  label: "Workspace active seats",
  inputSchema: z.object({ workspaceId: z.string().min(1) }),
  params: [
    {
      key: "workspaceId",
      label: "Workspace sId",
      type: "string",
      placeholder: "e.g. DevWkSpace",
    },
  ],
  buildKey: ({ workspaceId }) =>
    buildCacheWithRedisKey(
      WORKSPACE_ACTIVE_SEATS_CACHE_ID,
      workspaceActiveSeatsCacheKey(workspaceId)
    ),
  keyPattern: buildCacheWithRedisKey(
    WORKSPACE_ACTIVE_SEATS_CACHE_ID,
    workspaceActiveSeatsCacheKey("*")
  ),
});

export function getCachedWorkspaceActiveSeats(
  workspaceId: string,
  load: () => Promise<number>
): Promise<number> {
  return workspaceActiveSeatsCache.read({ workspaceId }, load);
}

export function invalidateWorkspaceActiveSeatsCache(
  workspaceId: string,
  transaction?: Transaction
): Promise<void> {
  return workspaceActiveSeatsCache.invalidate({ workspaceId }, transaction);
}
