import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { UserResource } from "@app/lib/resources/user_resource";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
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
  workspace:
    | WorkspaceResource
    | WorkspaceModel
    | WorkspaceType
    | LightWorkspaceType;
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
  workspace: WorkspaceModel
): Promise<UserType | undefined> {
  const user = await UserResource.getWorkspaceFirstAdmin(workspace.id);
  return user?.toJSON();
}

export async function getWorkspaceByModelId(id: ModelId) {
  const workspace = await WorkspaceModel.findByPk(id);

  return workspace;
}
