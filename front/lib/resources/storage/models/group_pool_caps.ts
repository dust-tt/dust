import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

// Per-group usage spend limit (excluding seat allowance), applied per member.
// The absence of a row means the group carries no cap.
export class GroupPoolCapModel extends WorkspaceAwareModel<GroupPoolCapModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare groupId: ForeignKey<GroupModel["id"]>;
  declare poolCapAwuCredits: number;
}

GroupPoolCapModel.init(
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
    poolCapAwuCredits: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    modelName: "group_pool_caps",
    sequelize: frontSequelize,
    indexes: [
      { unique: true, fields: ["groupId"] },
      { fields: ["workspaceId"], concurrently: true },
    ],
  }
);

GroupPoolCapModel.belongsTo(GroupModel, {
  foreignKey: { name: "groupId", allowNull: false },
  onDelete: "RESTRICT",
});
