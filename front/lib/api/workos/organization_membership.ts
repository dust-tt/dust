import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getWorkOS } from "./client";

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
    response.data.map((membership) => membership.organizationId),
    async (orgId) => getWorkOS().organizations.getOrganization(orgId),
    { concurrency: 10 }
  );

  return orgs;
}
