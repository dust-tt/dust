import { faker } from "@faker-js/faker";
import type { Transaction } from "sequelize";

import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { WorkspaceType } from "@app/types";

export class SpaceFactory {
  static async global(workspace: WorkspaceType) {
    return SpaceResource.makeNew(
      {
        name: "space " + faker.string.alphanumeric(8),
        kind: "global",
        workspaceId: workspace.id,
      },
      [] // TODO: Add groups
    );
  }

  static async system(workspace: WorkspaceType) {
    return SpaceResource.makeNew(
      {
        name: "space " + faker.string.alphanumeric(8),
        kind: "system",
        workspaceId: workspace.id,
      },
      [] // TODO: Add groups
    );
  }

  static async regular(workspace: WorkspaceType) {
    const name = "space " + faker.string.alphanumeric(8);
    const group = await GroupResource.makeNew({
      name: `Group for space ${name}`,
      workspaceId: workspace.id,
      kind: "regular",
    });

    return SpaceResource.makeNew(
      {
        name,
        kind: "regular",
        workspaceId: workspace.id,
      },
      [group]
    );
  }

  static async conversations(workspace: WorkspaceType) {
    return SpaceResource.makeNew(
      {
        name: "space " + faker.string.alphanumeric(8),
        kind: "conversations",
        workspaceId: workspace.id,
      },
      []
    );
  }
}
