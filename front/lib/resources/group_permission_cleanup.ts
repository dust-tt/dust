import { getRedisCacheClient } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type { GroupPermissionResourceType } from "@app/types/group_permissions";
import { WHOLE_TYPE_RESOURCE_ID } from "@app/types/group_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";
import type { Transaction, WhereOptions } from "sequelize";

// These model operations are shared only by GroupResource and GroupPermissionResource. Group
// deletion must revoke grants targeting it, while the permission resource already imports the
// group resource. Keeping the shared queries and cache invalidation in this resource-layer module
// avoids a circular import and lets both resources use the same transaction.

// Bump to orphan hashes written under the previous field encoding.
export const GROUP_PERMISSION_CACHE_SCHEMA_VERSION = 2;

export function groupPermissionCacheKey(workspaceModelId: ModelId): string {
  return `group_permissions:v${GROUP_PERMISSION_CACHE_SCHEMA_VERSION}:ws:${workspaceModelId}`;
}

// Read before deletion: afterwards there is nothing left to attribute the cache refresh to.
export async function listGroupModelIdsForGrants(
  where: WhereOptions<GroupPermissionModel>,
  transaction?: Transaction
): Promise<ModelId[]> {
  const rows = await GroupPermissionModel.findAll({
    attributes: ["groupId"],
    where,
    transaction,
  });
  return [...new Set(rows.map((row) => row.groupId))];
}

export async function listRegularAutoGroupIdsForResources(
  auth: Authenticator,
  {
    resourceType,
    resourceIds,
    transaction,
  }: {
    resourceType: GroupPermissionResourceType;
    resourceIds: number[];
    transaction?: Transaction;
  }
): Promise<ModelId[]> {
  if (resourceIds.length === 0) {
    return [];
  }
  const workspaceId = auth.getNonNullableWorkspace().id;
  const groupIds = await listGroupModelIdsForGrants(
    { workspaceId, resourceType, resourceId: [...new Set(resourceIds)] },
    transaction
  );
  if (groupIds.length === 0) {
    return [];
  }
  const groups = await GroupModel.findAll({
    attributes: ["id"],
    where: { id: groupIds, workspaceId, kind: "regular_auto" },
    transaction,
  });
  return groups.map((group) => group.id);
}

// Inside a transaction, defer eviction until commit: an earlier eviction lets a reader refill
// the cache from uncommitted rows. Delete the fields rather than rewriting them.
export function invalidateGroupGrantsAfterCommit(
  auth: Authenticator,
  groupModelIds: ModelId[],
  transaction?: Transaction
): void {
  if (groupModelIds.length === 0) {
    return;
  }
  const workspaceId = auth.getNonNullableWorkspace().id;
  invalidateCacheAfterCommit(transaction, async () => {
    try {
      const redis = await getRedisCacheClient({
        origin: "group_permissions_cache",
      });
      await redis.hDel(
        groupPermissionCacheKey(workspaceId),
        [...new Set(groupModelIds)].map(String)
      );
      statsDMetrics.increment("group_permissions_cache.invalidate", 1, [
        "result:ok",
      ]);
    } catch (err) {
      // A lost delete keeps revoked grants readable until the hash expires, the next mutation on
      // those groups or a Poke flush.
      logger.error(
        { panic: true, err: normalizeError(err), workspaceId },
        "group_permissions cache invalidation failed"
      );
      statsDMetrics.increment("group_permissions_cache.invalidate", 1, [
        "result:error",
      ]);
    }
  });
}

// Grant targets have no FK. Delete before the resource row, and evict each holder's cache field
// after commit so a revoked grant cannot remain readable.
export async function deleteGrantsForResources(
  auth: Authenticator,
  {
    resourceType,
    resourceIds,
    transaction,
  }: {
    resourceType: GroupPermissionResourceType;
    resourceIds: number[];
    transaction?: Transaction;
  }
): Promise<number> {
  const uniqueResourceIds = [...new Set(resourceIds)];
  if (uniqueResourceIds.length === 0) {
    return 0;
  }
  assert(
    uniqueResourceIds.every(
      (resourceId) => resourceId > 0 && resourceId !== WHOLE_TYPE_RESOURCE_ID
    ),
    "deleteGrantsForResources targets concrete resources; it must not clear type-wide grants."
  );
  const workspaceId = auth.getNonNullableWorkspace().id;
  const where = {
    workspaceId,
    resourceType,
    resourceId: uniqueResourceIds,
  };
  const groupIds = await listGroupModelIdsForGrants(where, transaction);
  const deleted = await GroupPermissionModel.destroy({ where, transaction });
  // Without a transaction this starts invalidation immediately. The delete must finish first so
  // another reader cannot refill the cache with a grant that is about to be revoked.
  invalidateGroupGrantsAfterCommit(auth, groupIds, transaction);
  return deleted;
}
