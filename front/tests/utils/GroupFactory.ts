import type { Workspace } from "@app/lib/models/workspace";
import { GroupResource } from "@app/lib/resources/group_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";

export class GroupFactory {
  static async defaults(workspace: Workspace) {
    return GroupResource.makeDefaultsForWorkspace(
      renderLightWorkspaceType({ workspace })
    );
  }
}
