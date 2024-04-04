import type {
  LightWorkspaceType,
  RoleType,
  WorkspaceType,
} from "@dust-tt/types";

import type { Workspace } from "@app/lib/models";
import { User } from "@app/lib/models";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";

export function renderLightWorkspaceType({
  workspace,
  role = "none",
}: {
  workspace: Workspace | WorkspaceType | LightWorkspaceType;
  role?: RoleType;
}): LightWorkspaceType {
  return {
    id: workspace.id,
    sId: workspace.sId,
    name: workspace.name,
    segmentation: workspace.segmentation,
    role,
  };
}

// TODO: This belong to the WorkspaceResource.
export async function getWorkspaceFirstAdmin(workspace: Workspace) {
  return User.findOne({
    include: [
      {
        model: MembershipModel,
        where: {
          role: "admin",
          workspaceId: workspace.id,
        },
        required: true,
      },
    ],
    order: [["createdAt", "ASC"]],
  });
}
