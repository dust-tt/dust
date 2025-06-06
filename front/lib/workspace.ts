import { Workspace } from "@app/lib/models/workspace";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  LightWorkspaceType,
  ModelId,
  RoleType,
  UserType,
  WorkspaceType,
} from "@app/types";

export function renderLightWorkspaceType({
  workspace,
  role = "none",
}: {
  workspace: Workspace | WorkspaceType | LightWorkspaceType;
  role?: RoleType;
}): LightWorkspaceType {
  return {
    defaultEmbeddingProvider: workspace.defaultEmbeddingProvider,
    id: workspace.id,
    metadata: workspace.metadata,
    name: workspace.name,
    role,
    segmentation: workspace.segmentation,
    sId: workspace.sId,
    whiteListedProviders: workspace.whiteListedProviders,
    workOSOrganizationId: workspace.workOSOrganizationId,
  };
}

// TODO: This belong to the WorkspaceResource.
export async function getWorkspaceFirstAdmin(
  workspace: Workspace
): Promise<UserType | undefined> {
  const user = await UserResource.getWorkspaceFirstAdmin(workspace.id);
  return user?.toJSON();
}

export async function getWorkspaceByModelId(id: ModelId) {
  const workspace = await Workspace.findByPk(id);

  return workspace;
}
