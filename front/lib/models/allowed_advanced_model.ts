import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import type { CreationOptional, ForeignKey } from "sequelize";

export class UserAllowedAdvancedModel extends WorkspaceAwareModel<UserAllowedAdvancedModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userId: ForeignKey<UserModel["id"]>;
  declare providerId: ModelProviderIdType;
  declare modelId: ModelIdType;
}

UserAllowedAdvancedModel.init(
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
    userId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    modelId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "user_allowed_advanced_models",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        name: "user_allowed_advanced_models_unique_idx",
        fields: ["workspaceId", "userId", "providerId", "modelId"],
      },
      { fields: ["workspaceId", "userId"], concurrently: true },
      { fields: ["userId"], concurrently: true },
    ],
  }
);

UserAllowedAdvancedModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
  targetKey: "id",
});

export class GroupAllowedAdvancedModel extends WorkspaceAwareModel<GroupAllowedAdvancedModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare groupId: ForeignKey<GroupModel["id"]>;
  declare providerId: ModelProviderIdType;
  declare modelId: ModelIdType;
}

GroupAllowedAdvancedModel.init(
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
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    modelId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "group_allowed_advanced_models",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        name: "group_allowed_advanced_models_unique_idx",
        fields: ["workspaceId", "groupId", "providerId", "modelId"],
      },
      { fields: ["workspaceId", "groupId"], concurrently: true },
      { fields: ["groupId"], concurrently: true },
    ],
  }
);

GroupAllowedAdvancedModel.belongsTo(GroupModel, {
  foreignKey: { name: "groupId", allowNull: false },
  targetKey: "id",
});

export class WorkspaceAllowedAdvancedModel extends WorkspaceAwareModel<WorkspaceAllowedAdvancedModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare providerId: ModelProviderIdType;
  declare modelId: ModelIdType;
}

WorkspaceAllowedAdvancedModel.init(
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
    modelId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "workspace_allowed_advanced_models",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        name: "workspace_allowed_advanced_models_unique_idx",
        fields: ["workspaceId", "providerId", "modelId"],
      },
      { fields: ["workspaceId"], concurrently: true },
    ],
  }
);
