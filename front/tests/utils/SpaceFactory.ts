import { faker } from "@faker-js/faker";
import type { InferCreationAttributes } from "sequelize";

import type { Workspace } from "@app/lib/models/workspace";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";

import { Factory } from "./factories";

class SpaceFactory extends Factory<SpaceModel> {
  async make(params: InferCreationAttributes<SpaceModel>) {
    return SpaceModel.create(params);
  }

  global(workspace: Workspace) {
    return this.params({
      name: "space " + faker.string.alphanumeric(8),
      kind: "global",
      workspaceId: workspace.id,
    });
  }

  system(workspace: Workspace) {
    return this.params({
      name: "space " + faker.string.alphanumeric(8),
      kind: "system",
      workspaceId: workspace.id,
    });
  }

  regular(workspace: Workspace) {
    return this.params({
      name: "space " + faker.string.alphanumeric(8),
      kind: "regular",
      workspaceId: workspace.id,
    });
  }
}

export const spaceFactory = () => {
  return new SpaceFactory();
};
