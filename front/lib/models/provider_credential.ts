import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

export class ProviderCredentialModel extends WorkspaceAwareModel<ProviderCredentialModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare providerId: ModelProviderIdType;
  declare credentialId: string;
  declare isHealthy: boolean;
  declare placeholder: string;

  declare editedByUserId: ForeignKey<UserModel["id"]> | null;
  declare editedByUser: NonAttribute<UserModel>;
}

ProviderCredentialModel.init(
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
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    credentialId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    placeholder: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    isHealthy: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "provider_credential",
    indexes: [
      {
        unique: true,
        fields: ["workspaceId", "providerId"],
      },
    ],
  }
);

ProviderCredentialModel.belongsTo(UserModel, {
  as: "editedByUser",
  foreignKey: { name: "editedByUserId", allowNull: true },
});
