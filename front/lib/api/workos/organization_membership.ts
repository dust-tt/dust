import { getWorkOS } from "@app/lib/api/workos/client";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";

const MAX_CONCURRENT_WORKOS_FETCH = 10;

// Cache TTL for WorkOS organization memnbership data (1 hour)
const WORKOS_ORG_CACHE_TTL_MS = 60 * 60 * 1000;

async function findWorkOSOrganizationsForUserIdUncached(userId: string) {
  const response = await getWorkOS().userManagement.listOrganizationMemberships(
    {
      userId,
      statuses: ["active"],
      limit: 50, // By default it returns 10 so we need to increase the limit.
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

export const invalidateWorkOSOrganizationsCacheForUserId =
  invalidateCacheWithRedis(
    findWorkOSOrganizationsForUserIdUncached,
    (userId: string) => {
      return `workos-orgs-${userId}`;
    }
  );
