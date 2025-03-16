import { GroupResource } from "@app/lib/resources/group_resource";
import type { WorkspaceType } from "@app/types";

export class GroupFactory {
  static async defaults(workspace: WorkspaceType) {
    return GroupResource.makeDefaultsForWorkspace(workspace);
  }
}
