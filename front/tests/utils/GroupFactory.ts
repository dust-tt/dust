import { faker } from "@faker-js/faker";

import { GroupResource } from "@app/lib/resources/group_resource";
import type { WorkspaceType } from "@app/types";

export class GroupFactory {
  static async defaults(workspace: WorkspaceType) {
    return GroupResource.makeDefaultsForWorkspace(workspace);
  }

  static async regular(workspace: WorkspaceType) {
    return GroupResource.makeNew({
      name: "group " + faker.string.alphanumeric(8),
      kind: "regular",
      workspaceId: workspace.id,
    });
  }
}
