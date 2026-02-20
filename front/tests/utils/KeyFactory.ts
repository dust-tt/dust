import type { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import { faker } from "@faker-js/faker";
import type { InferCreationAttributes } from "sequelize";

export class KeyFactory {
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async make(params: InferCreationAttributes<KeyModel>) {
    return KeyModel.create(params);
  }

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  static async regular(group: GroupResource) {
    return KeyResource.makeNew(
      {
        name: "key-" + faker.string.alphanumeric(8),
        workspaceId: group.workspaceId,
        isSystem: false,
        status: "active",
        role: "builder",
      },
      group
    );
  }

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  static async disabled(group: GroupResource) {
    return KeyResource.makeNew(
      {
        name: "key-" + faker.string.alphanumeric(8),
        workspaceId: group.workspaceId,
        isSystem: false,
        status: "disabled",
        role: "builder",
      },
      group
    );
  }

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  static async system(group: GroupResource) {
    return KeyResource.makeNew(
      {
        name: "key-" + faker.string.alphanumeric(8),
        workspaceId: group.workspaceId,
        isSystem: true,
        status: "active",
        role: "admin",
      },
      group
    );
  }
}
