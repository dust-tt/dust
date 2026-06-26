import {
  eitherGlobalOrCustomSkillValidation,
  SkillConfigurationModel,
} from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes, Op } from "@app/lib/resources/storage/data_types";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

export class SkillFavoriteModel extends WorkspaceAwareModel<SkillFavoriteModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<UserModel["id"]>;
  declare customSkillId: ForeignKey<SkillConfigurationModel["id"]> | null;
  declare globalSkillId: string | null;
}

SkillFavoriteModel.init(
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
    customSkillId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: SkillConfigurationModel,
        key: "id",
      },
    },
    globalSkillId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "skill_favorites",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        fields: ["workspaceId", "userId", "customSkillId"],
        where: { customSkillId: { [Op.ne]: null } },
        name: "skill_favorites_workspace_user_custom",
        concurrently: true,
      },
      {
        unique: true,
        fields: ["workspaceId", "userId", "globalSkillId"],
        where: { globalSkillId: { [Op.ne]: null } },
        name: "skill_favorites_workspace_user_global",
        concurrently: true,
      },
      {
        fields: ["userId"],
        name: "skill_favorites_user_id",
        concurrently: true,
      },
      {
        fields: ["customSkillId"],
        where: { customSkillId: { [Op.ne]: null } },
        name: "skill_favorites_custom_skill_id",
        concurrently: true,
      },
      {
        fields: ["globalSkillId"],
        where: { globalSkillId: { [Op.ne]: null } },
        name: "skill_favorites_global_skill_id",
        concurrently: true,
      },
    ],
    validate: {
      eitherGlobalOrCustomSkill: eitherGlobalOrCustomSkillValidation,
    },
  }
);

UserModel.hasMany(SkillFavoriteModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});
SkillFavoriteModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
  as: "user",
});

SkillConfigurationModel.hasMany(SkillFavoriteModel, {
  foreignKey: { name: "customSkillId", allowNull: true },
  onDelete: "RESTRICT",
});
SkillFavoriteModel.belongsTo(SkillConfigurationModel, {
  foreignKey: { name: "customSkillId", allowNull: true },
  as: "customSkill",
});
