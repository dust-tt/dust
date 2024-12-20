import type { GroupKind } from "@dust-tt/types";
import { isGlobalGroupKind, isSystemGroupKind } from "@dust-tt/types";
import type { CreationOptional, ForeignKey, Transaction } from "sequelize";
import { DataTypes } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { BaseModel } from "@app/lib/resources/storage/wrappers";

export class GroupModel extends BaseModel<GroupModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare kind: GroupKind;

  declare workspaceId: ForeignKey<Workspace["id"]>;
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
  },
  {
    modelName: "groups",
    sequelize: frontSequelize,
    indexes: [{ unique: true, fields: ["workspaceId", "name"] }],
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

Workspace.hasMany(GroupModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
GroupModel.belongsTo(Workspace);
