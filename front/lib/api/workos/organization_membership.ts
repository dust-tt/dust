import { getRedisClient } from "@app/lib/api/redis";
import { getWorkOS } from "@app/lib/api/workos/client";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { cacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";

const MAX_CONCURRENT_WORKOS_FETCH = 10;

// Cache TTL for WorkOS organization memnbership data (5 minutes)
const WORKOS_ORG_CACHE_TTL_MS = 5 * 60 * 1000;

export async function fetchWorkOSOrganizationMembershipsForUserIdAndOrgId(
  userId: string,
  organizationId: string
) {
  const response = await getWorkOS().userManagement.listOrganizationMemberships(
    {
      userId,
      organizationId,
    }
  );

  return response.data;
}

export async function findWorkOSOrganizationsForUserIdUncached(userId: string) {
  const response = await getWorkOS().userManagement.listOrganizationMemberships(
    {
      userId,
      statuses: ["active"],
    }
  );

  const orgs = await concurrentExecutor(
    response.data
      .filter((membership) =>
        ["admin", "builder", "user"].includes(membership.role.slug)
      )
      .map((membership) => membership.organizationId),
    async (orgId) => getWorkOS().organizations.getOrganization(orgId),
    { concurrency: MAX_CONCURRENT_WORKOS_FETCH }
  );

  return orgs;
}

export const findWorkOSOrganizationsForUserId = cacheWithRedis(
  findWorkOSOrganizationsForUserIdUncached,
  (userId: string) => {
    return `workos-orgs-${userId}`;
  },
  {
    ttlMs: WORKOS_ORG_CACHE_TTL_MS,
  }
);

export async function invalidateWorkOSOrganizationsCache(
  userId: string
): Promise<void> {
  try {
    const redis = await getRedisClient({ origin: "workos_orgs_cache" });
    const cacheKey = `cacheWithRedis-findWorkOSOrganizationsForUserIdUncached-workos-orgs-${userId}`;
    await redis.del(cacheKey);
  } catch (error) {
    logger.error({ userId }, "Failed to invalidate workos membership cache");
  }
}
