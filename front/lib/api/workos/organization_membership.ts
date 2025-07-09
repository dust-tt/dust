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
