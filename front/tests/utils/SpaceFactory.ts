import { faker } from "@faker-js/faker";
import type { Transaction } from "sequelize";

import { SpaceResource } from "@app/lib/resources/space_resource";
import type { WorkspaceType } from "@app/types";

export class SpaceFactory {
  static async global(workspace: WorkspaceType, t: Transaction) {
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

  static async system(workspace: WorkspaceType, t: Transaction) {
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

  static async regular(workspace: WorkspaceType, t: Transaction) {
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
