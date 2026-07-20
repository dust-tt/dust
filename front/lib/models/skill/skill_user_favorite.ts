import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

export class SkillUserFavoriteModel extends WorkspaceAwareModel<SkillUserFavoriteModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<UserModel["id"]>;
  declare skillIds: string[];
}

SkillUserFavoriteModel.init(
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
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
    userId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: UserModel,
        key: "id",
      },
    },
    skillIds: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    modelName: "skill_user_favorites",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        fields: ["workspaceId", "userId"],
        name: "skill_user_favorites_workspace_user",
        concurrently: true,
      },
      {
        fields: ["userId"],
        name: "skill_user_favorites_user_id",
        concurrently: true,
      },
    ],
  }
);

UserModel.hasMany(SkillUserFavoriteModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});
SkillUserFavoriteModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
  as: "user",
});
