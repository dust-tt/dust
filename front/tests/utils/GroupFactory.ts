import { faker } from "@faker-js/faker";
import type { InferCreationAttributes } from "sequelize";

import type { Workspace } from "@app/lib/models/workspace";
import { GroupModel } from "@app/lib/resources/storage/models/groups";

import { Factory } from "./factories";

class GroupFactory extends Factory<GroupModel> {
  async make(params: InferCreationAttributes<GroupModel>) {
    return GroupModel.create(params);
  }

  global(workspace: Workspace) {
    return this.params({
      name: "group " + faker.string.alphanumeric(8),
      kind: "global",
      workspaceId: workspace.id,
    });
  }

  system(workspace: Workspace) {
    return this.params({
      name: "group " + faker.string.alphanumeric(8),
      kind: "system",
      workspaceId: workspace.id,
    });
  }
}

export const groupFactory = () => {
  return new GroupFactory();
};
