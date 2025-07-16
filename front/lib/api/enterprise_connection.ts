import { getAuth0ManagemementClient } from "@app/lib/api/auth0";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { LightWorkspaceType } from "@app/types";

export function makeEnterpriseConnectionName(workspaceId: string) {
  return `workspace-${workspaceId}`;
}

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

export function makeAudienceUri(owner: LightWorkspaceType) {
  return `${config.getAuth0AudienceUri()}:${makeEnterpriseConnectionName(owner.sId)}`;
}

export function makeSamlAcsUrl(owner: LightWorkspaceType) {
  return `https://${config.getAuth0TenantUrl()}/login/callback?connection=${makeEnterpriseConnectionName(owner.sId)}`;
}

export async function getEnterpriseConnectionForWorkspace(auth: Authenticator) {
  const owner = auth.getNonNullableWorkspace();

  const expectedConnectionName = makeEnterpriseConnectionName(owner.sId);

  const connections = await getAuth0ManagemementClient().connections.getAll({
    name: expectedConnectionName,
  });

  return connections.data.find((c) => c.name === expectedConnectionName);
}
