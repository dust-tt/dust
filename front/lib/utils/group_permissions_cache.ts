import { getRedisCacheClient } from "@app/lib/api/redis";
import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Transaction } from "sequelize";

export const GROUP_PERMISSIONS_CACHE_SCHEMA_VERSION = 1;

export function groupPermissionsCacheKey(workspaceModelId: ModelId): string {
  return `group_permissions:v${GROUP_PERMISSIONS_CACHE_SCHEMA_VERSION}:ws:${workspaceModelId}`;
}

/**
 * @cc [owner:aubin-tchoi,label:security;backend] deleted-group-grants-cache
 * Grant mutation and group deletion invalidate the same workspace-scoped cache fields only
 * after commit; failed invalidation emits a panic because cached grants never expire.
 */
export async function invalidateGroupPermissionsCacheAfterCommit(
  workspaceModelId: ModelId,
  groupModelIds: readonly ModelId[],
  transaction?: Transaction
): Promise<void> {
  if (groupModelIds.length === 0) {
    return;
  }
  const fields = [...new Set(groupModelIds)].map(String);
  await invalidateCacheAfterCommit(transaction, async () => {
    try {
      const redis = await getRedisCacheClient({
        origin: "group_permissions_cache",
      });
      await redis.hDel(groupPermissionsCacheKey(workspaceModelId), fields);
      statsDMetrics.increment("group_permissions_cache.invalidate", 1, [
        "result:ok",
      ]);
    } catch (err) {
      logger.error(
        {
          panic: true,
          err: normalizeError(err),
          workspaceId: workspaceModelId,
        },
        "group_permissions cache invalidation failed"
      );
      statsDMetrics.increment("group_permissions_cache.invalidate", 1, [
        "result:error",
      ]);
    }
  });
}
