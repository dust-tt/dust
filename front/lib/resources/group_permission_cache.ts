import { getRedisCacheClient } from "@app/lib/api/redis";
import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";
import type {
  GrantType,
  GroupPermissionResourceType,
} from "@app/types/group_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import type { Transaction } from "sequelize";

export interface CachedWorkspaceGrant {
  groupModelId: ModelId;
  grantType: GrantType;
  resourceType: GroupPermissionResourceType;
  resourceId: number;
}

export const WORKSPACE_GRANTS_CACHE_ID = "workspace_group_permissions";
export const WORKSPACE_GRANTS_CACHE_TTL_MS = 60 * 1000;
const WORKSPACE_GRANTS_GENERATION_TTL_MS = 5 * WORKSPACE_GRANTS_CACHE_TTL_MS;

export const workspaceGrantsCacheKeyResolver = (
  workspaceModelId: ModelId,
  generation: number
): string => `workspace-group-permissions:${workspaceModelId}:${generation}`;

const workspaceGrantsGenerationKey = (workspaceModelId: ModelId): string =>
  `workspace-group-permissions-generation:${workspaceModelId}`;

export async function getWorkspaceGrantsCacheGeneration(
  workspaceModelId: ModelId
): Promise<number> {
  const redis = await getRedisCacheClient({
    origin: "group_permissions_cache",
  });
  const generation = await redis.get(
    workspaceGrantsGenerationKey(workspaceModelId)
  );

  return generation === null ? 0 : Number.parseInt(generation, 10);
}

async function advanceWorkspaceGrantsCacheGeneration(
  workspaceModelId: ModelId
): Promise<void> {
  const redis = await getRedisCacheClient({
    origin: "group_permissions_cache",
  });
  const key = workspaceGrantsGenerationKey(workspaceModelId);

  await redis.eval(
    `
      local generation = redis.call("incr", KEYS[1])
      redis.call("pexpire", KEYS[1], ARGV[1])
      return generation
    `,
    {
      keys: [key],
      arguments: [WORKSPACE_GRANTS_GENERATION_TTL_MS.toString()],
    }
  );
}

export async function advanceWorkspaceGrantsCacheGenerationAfterCommit(
  workspaceModelId: ModelId,
  transaction?: Transaction
): Promise<void> {
  if (transaction) {
    invalidateCacheAfterCommit(transaction, () =>
      advanceWorkspaceGrantsCacheGeneration(workspaceModelId)
    );
    return;
  }

  await advanceWorkspaceGrantsCacheGeneration(workspaceModelId);
}
