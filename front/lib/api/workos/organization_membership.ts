import { getWorkOS } from "@app/lib/api/workos/client";
import { concurrentExecutor } from "@app/lib/utils/async_utils";

const MAX_CONCURRENT_WORKOS_FETCH = 10;

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

export async function findWorkOSOrganizationsForUserId(userId: string) {
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
