import type { Authenticator } from "@app/lib/auth";
import { VaultResource } from "@app/lib/resources/vault_resource";

export const getDustAppsListUrl = async (
  auth: Authenticator
): Promise<string> => {
  const owner = auth.getNonNullableWorkspace();

  const defaultUrl = `/w/${owner.sId}/a`;

  if (!owner.flags.includes("data_vaults_feature")) {
    return defaultUrl;
  }

  const vault = await VaultResource.fetchWorkspaceGlobalVault(auth);
  if (!vault) {
    return defaultUrl;
  }
  return `/w/${owner.sId}/vaults/${vault.sId}/categories/apps`;
};
