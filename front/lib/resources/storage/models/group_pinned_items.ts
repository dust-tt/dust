import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { GroupPinnedItemType } from "@app/types/discovery";
import type { CreationOptional, ForeignKey } from "sequelize";

export class GroupPinnedItemModel extends WorkspaceAwareModel<GroupPinnedItemModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare groupId: ForeignKey<GroupModel["id"]>;
  declare position: number;
  declare type: GroupPinnedItemType;
  declare itemId: string;
}

GroupPinnedItemModel.init(
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
    groupId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    itemId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "group_pinned_items",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "group_pinned_items_group_position_unique",
        unique: true,
        fields: ["groupId", "position"],
      },
      {
        name: "group_pinned_items_group_type_item_unique",
        unique: true,
        fields: ["groupId", "type", "itemId"],
      },
    ],
  }
);

GroupPinnedItemModel.belongsTo(GroupModel, {
  foreignKey: { name: "groupId", allowNull: false },
  onDelete: "RESTRICT",
});
GroupModel.hasMany(GroupPinnedItemModel, {
  foreignKey: { name: "groupId", allowNull: false },
  onDelete: "RESTRICT",
});
