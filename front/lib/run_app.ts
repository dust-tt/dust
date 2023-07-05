import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions_registry";
import { planForWorkspace, prodAPICredentialsForOwner } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { Workspace } from "@app/lib/models";
import { WorkspaceType } from "@app/types/user";

export async function runAppOnWorkspaceId(
  workspaceId: string,
  appName: string,
  inputs: any
) {
  const owner = await _getSystemOwnerForWorkspaceId(workspaceId);
  const prodCredentials = await prodAPICredentialsForOwner(owner);
  const prodAPI = new DustAPI(prodCredentials);
  const app = cloneBaseConfig(DustProdActionRegistry[appName]?.app);
  const config = cloneBaseConfig(DustProdActionRegistry[appName]?.config);

  return await prodAPI.runApp(app, config, inputs);
}

async function _getSystemOwnerForWorkspaceId(
  workspaceId: string
): Promise<WorkspaceType> {
  const workspace = await Workspace.findOne({
    where: {
      sId: workspaceId,
    },
  });
  if (!workspace) {
    throw new Error(`Could not find workspace with sId ${workspaceId}`);
  }
  return {
    id: workspace.id,
    uId: workspace.uId,
    sId: workspace.sId,
    name: workspace.name,
    allowedDomain: workspace.allowedDomain || null,
    role: "system",
    plan: planForWorkspace(workspace),
  };
}
