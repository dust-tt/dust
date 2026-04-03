import type { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import { faker } from "@faker-js/faker";
import type { InferCreationAttributes } from "sequelize";

function normalizeGroups(
  groupOrGroups: GroupResource | GroupResource[]
): GroupResource[] {
  return Array.isArray(groupOrGroups) ? groupOrGroups : [groupOrGroups];
}

export class KeyFactory {
  async make(params: InferCreationAttributes<KeyModel>) {
    return KeyModel.create(params);
  }

  static async regular(groupOrGroups: GroupResource | GroupResource[]) {
    const groups = normalizeGroups(groupOrGroups);
    return KeyResource.makeNew(
      {
        name: "key-" + faker.string.alphanumeric(8),
        workspaceId: groups[0].workspaceId,
        isSystem: false,
        status: "active",
        role: "builder",
      },
      groups
    );
  }

  static async disabled(groupOrGroups: GroupResource | GroupResource[]) {
    const groups = normalizeGroups(groupOrGroups);
    return KeyResource.makeNew(
      {
        name: "key-" + faker.string.alphanumeric(8),
        workspaceId: groups[0].workspaceId,
        isSystem: false,
        status: "disabled",
        role: "builder",
      },
      groups
    );
  }

  static async system(groupOrGroups: GroupResource | GroupResource[]) {
    const groups = normalizeGroups(groupOrGroups);
    return KeyResource.makeNew(
      {
        name: "key-" + faker.string.alphanumeric(8),
        workspaceId: groups[0].workspaceId,
        isSystem: true,
        status: "active",
        role: "admin",
      },
      groups
    );
  }
}
