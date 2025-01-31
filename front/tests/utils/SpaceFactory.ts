import { faker } from "@faker-js/faker";
import type { Transaction } from "sequelize";

import type { Workspace } from "@app/lib/models/workspace";
import { SpaceResource } from "@app/lib/resources/space_resource";

export class SpaceFactory {
  static async global(workspace: Workspace, t: Transaction) {
    return SpaceResource.makeNew(
      {
        name: "space " + faker.string.alphanumeric(8),
        kind: "global",
        workspaceId: workspace.id,
      },
      [], // TODO: Add groups
      t
    );
  }

  static async system(workspace: Workspace, t: Transaction) {
    return SpaceResource.makeNew(
      {
        name: "space " + faker.string.alphanumeric(8),
        kind: "system",
        workspaceId: workspace.id,
      },
      [], // TODO: Add groups
      t
    );
  }

  static async regular(workspace: Workspace, t: Transaction) {
    return SpaceResource.makeNew(
      {
        name: "space " + faker.string.alphanumeric(8),
        kind: "regular",
        workspaceId: workspace.id,
      },
      [], // TODO: Add groups
      t
    );
  }
}
