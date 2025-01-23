import type { InferCreationAttributes } from "sequelize";

import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import type { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { SpaceModel } from "@app/lib/resources/storage/models/spaces";

import { Factory } from "./factories";

class GroupSpaceFactory extends Factory<GroupSpaceModel> {
  async make(params: InferCreationAttributes<GroupSpaceModel>) {
    return GroupSpaceModel.create(params);
  }

  associate(space: SpaceModel, group: GroupModel) {
    return this.params({
      groupId: group.id,
      vaultId: space.id,
      workspaceId: space.workspaceId,
    }).create();
  }
}

export const groupSpaceFactory = () => {
  return new GroupSpaceFactory();
};
