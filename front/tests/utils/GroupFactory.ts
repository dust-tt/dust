import type { WorkspaceType } from "@dust-tt/types";

import { GroupResource } from "@app/lib/resources/group_resource";

export class GroupFactory {
  static async defaults(workspace: WorkspaceType) {
    return GroupResource.makeDefaultsForWorkspace(workspace);
  }
}
