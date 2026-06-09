import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { WorkspaceSandboxEnvVarKind } from "@app/types/sandbox/env_var";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes, DANGEROUSLY_UNBOUNDED_TEXT } from "@app/lib/resources/storage/data_types";

export class WorkspaceSandboxEnvVarModel extends WorkspaceAwareModel<WorkspaceSandboxEnvVarModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare kind: CreationOptional<WorkspaceSandboxEnvVarKind>;
  declare placeholderNonce: Buffer | null;
  declare allowedDomains: string[] | null;
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
    kind: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
      defaultValue: "config",
    },
    placeholderNonce: {
      type: DataTypes.BLOB,
      allowNull: true,
      field: "placeholder_nonce",
    },
    allowedDomains: {
      type: DataTypes.ARRAY(DANGEROUSLY_UNBOUNDED_TEXT),
      allowNull: true,
      field: "allowed_domains",
    },
    encryptedValue: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
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
