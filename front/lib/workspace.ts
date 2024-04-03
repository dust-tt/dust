import type {
  LightWorkspaceType,
  RoleType,
  WorkspaceType,
} from "@dust-tt/types";

import type { Workspace } from "@app/lib/models";

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
