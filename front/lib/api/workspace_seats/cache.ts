import { countMembershipsForWorkspace } from "@app/lib/resources/membership_queries";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { buildCacheWithRedisKey } from "@app/lib/utils/cache";
import { defineCache } from "@app/lib/utils/cache_handle";
import { defineCacheOperations } from "@app/lib/utils/cache_operations";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Transaction } from "sequelize";
import { z } from "zod";

const WORKSPACE_ACTIVE_SEATS_CACHE_TTL_MS = 5 * 60 * 1000;
// Keep the deployed physical key: the cached payload has not changed, so moving it would only
// create a rolling-deploy invalidation problem. The Poke operation keeps its owner-facing id.
const WORKSPACE_ACTIVE_SEATS_CACHE_ID = "_countActiveSeatsInWorkspaceUncached";
const WORKSPACE_ACTIVE_SEATS_CACHE_OPERATIONS_ID = "workspace_active_seats";
const workspaceActiveSeatsCacheKey = (workspaceId: string) =>
  `count-active-seats-in-workspace:${workspaceId}`;

const workspaceActiveSeatsCache = defineCache<{ workspaceId: string }, number>({
  id: WORKSPACE_ACTIVE_SEATS_CACHE_ID,
  key: ({ workspaceId }) => workspaceActiveSeatsCacheKey(workspaceId),
  load: async ({ workspaceId }) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found for sId: ${workspaceId}`);
    }

    return countMembershipsForWorkspace({
      workspace: renderLightWorkspaceType({ workspace }),
      activeOnly: true,
    });
  },
  ttlMs: WORKSPACE_ACTIVE_SEATS_CACHE_TTL_MS,
  cacheNullValues: false,
});

export const workspaceActiveSeatsCacheOperations = defineCacheOperations({
  id: WORKSPACE_ACTIVE_SEATS_CACHE_OPERATIONS_ID,
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
  workspaceId: string
): Promise<number> {
  return workspaceActiveSeatsCache.get({ workspaceId });
}

export function invalidateWorkspaceActiveSeatsCache(
  workspaceId: string,
  transaction?: Transaction
): Promise<void> {
  return workspaceActiveSeatsCache.invalidate({ workspaceId }, transaction);
}
