import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

export class WorkspaceSandboxEnvVarModel extends WorkspaceAwareModel<WorkspaceSandboxEnvVarModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare encryptedValue: string;
  declare createdByUserId: ForeignKey<UserModel["id"]> | null;
  declare lastUpdatedByUserId: ForeignKey<UserModel["id"]> | null;

  declare createdByUser: NonAttribute<UserModel | null>;
  declare lastUpdatedByUser: NonAttribute<UserModel | null>;
}

WorkspaceSandboxEnvVarModel.init(
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
    encryptedValue: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    createdByUserId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: UserModel,
        key: "id",
      },
    },
    lastUpdatedByUserId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: UserModel,
        key: "id",
      },
    },
  },
  {
    modelName: "workspace_sandbox_env_var",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "workspace_sandbox_env_vars_workspace_name_idx",
        unique: true,
        fields: ["workspaceId", "name"],
      },
      {
        name: "workspace_sandbox_env_vars_workspace_id_idx",
        fields: ["workspaceId"],
      },
      {
        name: "workspace_sandbox_env_vars_created_by_user_id_idx",
        fields: ["createdByUserId"],
      },
      {
        name: "workspace_sandbox_env_vars_last_updated_by_user_id_idx",
        fields: ["lastUpdatedByUserId"],
      },
    ],
  }
);

WorkspaceSandboxEnvVarModel.belongsTo(UserModel, {
  as: "createdByUser",
  foreignKey: { name: "createdByUserId", allowNull: true },
  onDelete: "SET NULL",
});

WorkspaceSandboxEnvVarModel.belongsTo(UserModel, {
  as: "lastUpdatedByUser",
  foreignKey: { name: "lastUpdatedByUserId", allowNull: true },
  onDelete: "SET NULL",
});
