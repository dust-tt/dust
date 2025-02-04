import { faker } from "@faker-js/faker";
import type { InferCreationAttributes } from "sequelize";

import type { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { KeyModel } from "@app/lib/resources/storage/models/keys";

export class KeyFactory {
  async make(params: InferCreationAttributes<KeyModel>) {
    return KeyModel.create(params);
  }

  static async regular(group: GroupResource) {
    return KeyResource.makeNew(
      {
        name: "key-" + faker.string.alphanumeric(8),
        workspaceId: group.workspaceId,
        isSystem: false,
        status: "active",
      },
      group
    );
  }

  static async disabled(group: GroupResource) {
    return KeyResource.makeNew(
      {
        name: "key-" + faker.string.alphanumeric(8),
        workspaceId: group.workspaceId,
        isSystem: false,
        status: "disabled",
      },
      group
    );
  }

  static async system(group: GroupResource) {
    return KeyResource.makeNew(
      {
        name: "key-" + faker.string.alphanumeric(8),
        workspaceId: group.workspaceId,
        isSystem: true,
        status: "active",
      },
      group
    );
  }
}
