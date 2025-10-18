import type { CreationOptional, NonAttribute, Transaction } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import type { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { GroupKind } from "@app/types";
import { isGlobalGroupKind, isSystemGroupKind } from "@app/types";

export class GroupModel extends WorkspaceAwareModel<GroupModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare kind: GroupKind;

  // Group ID on workOS, unique across all directories.
  declare workOSGroupId: string | null;

  // Association
  declare groupSpaces?: NonAttribute<GroupSpaceModel[]>;
}

GroupModel.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    kind: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    workOSGroupId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "groups",
    sequelize: frontSequelize,
    indexes: [
      { unique: true, fields: ["workspaceId", "name"] },
      { unique: true, fields: ["workspaceId", "workOSGroupId"] },
      { fields: ["workspaceId", "kind"] },
    ],
  }
);

GroupModel.addHook(
  "beforeCreate",
  "enforce_one_system_and_global_group_per_workspace",
  async (group: GroupModel, options: { transaction: Transaction }) => {
    const groupKind = group.kind;
    if (isSystemGroupKind(groupKind) || isGlobalGroupKind(groupKind)) {
      const existingSystemOrWorkspaceGroupType = await GroupModel.findOne({
        where: {
          workspaceId: group.workspaceId,
          kind: groupKind,
        },
        transaction: options.transaction,
      });

      if (existingSystemOrWorkspaceGroupType) {
        throw new Error(`A ${groupKind} group exists for this workspace.`, {
          cause: `enforce_one_${groupKind}_group_per_workspace`,
        });
      }
    }
  }
);
