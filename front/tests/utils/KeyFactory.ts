import { faker } from "@faker-js/faker";
import type { InferCreationAttributes } from "sequelize";

import { SECRET_KEY_PREFIX } from "@app/lib/resources/key_resource";
import type { GroupModel } from "@app/lib/resources/storage/models/groups";
import { KeyModel } from "@app/lib/resources/storage/models/keys";

import { Factory } from "./factories";

class KeyFactory extends Factory<KeyModel> {
  async make(params: InferCreationAttributes<KeyModel>) {
    return KeyModel.create(params);
  }

  regular(group: GroupModel) {
    return this.params({
      name: "key-" + faker.string.alphanumeric(8),
      secret: SECRET_KEY_PREFIX + faker.string.alphanumeric(32),
      groupId: group.id,
      workspaceId: group.workspaceId,
      isSystem: false,
      status: "active",
    });
  }

  disabled(group: GroupModel) {
    return this.params({
      name: "key-" + faker.string.alphanumeric(8),
      secret: SECRET_KEY_PREFIX + faker.string.alphanumeric(32),
      groupId: group.id,
      workspaceId: group.workspaceId,
      isSystem: false,
      status: "disabled",
    });
  }

  system(group: GroupModel) {
    return this.params({
      name: "key-" + faker.string.alphanumeric(8),
      secret: SECRET_KEY_PREFIX + faker.string.alphanumeric(32),
      groupId: group.id,
      workspaceId: group.workspaceId,
      isSystem: true,
      status: "active",
    });
  }
}

export const keyFactory = () => {
  return new KeyFactory();
};
