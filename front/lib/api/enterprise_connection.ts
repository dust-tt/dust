import config from "@app/lib/api/config";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";

export async function makeEnterpriseConnectionInitiateLoginUrl(
  workspaceId: string,
  returnTo: string | null
) {
  const workspace = await WorkspaceModel.findOne({
    where: {
      sId: workspaceId,
    },
  });

  if (!workspace || !workspace.workOSOrganizationId) {
    return `${config.getClientFacingUrl()}/api/workos/login`;
  }

  return `${config.getClientFacingUrl()}/api/workos/login?organizationId=${workspace.workOSOrganizationId}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`;
}
