import config from "@app/lib/api/config";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";

export async function makeEnterpriseConnectionInitiateLoginUrl(
  workspaceId: string,
  returnTo: string | null
) {
  const workspace = await WorkspaceResource.fetchById(workspaceId);

  if (!workspace || !workspace.workOSOrganizationId) {
    return `${config.getClientFacingUrl()}/api/workos/login`;
  }

  return `${config.getClientFacingUrl()}/api/workos/login?organizationId=${workspace.workOSOrganizationId}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`;
}
