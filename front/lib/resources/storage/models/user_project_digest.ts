import { ConversationModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

export class UserProjectDigestModel extends WorkspaceAwareModel<UserProjectDigestModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare spaceId: ForeignKey<SpaceModel["id"]>;
  declare userId: ForeignKey<UserModel["id"]>;
  declare sourceConversationId: ForeignKey<ConversationModel["id"]> | null;

  declare digest: string;

  declare space: NonAttribute<SpaceModel>;
  declare user: NonAttribute<UserModel>;
  declare sourceConversation: NonAttribute<ConversationModel> | null;
}

UserProjectDigestModel.init(
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
    digest: {
      type: DataTypes.TEXT,
      allowNull: false,
      // TODO(rcs): rename field in DB
      field: "journalEntry",
    },
  },
  {
    modelName: "user_project_digest",
    // TODO(rcs): rename table in DB
    tableName: "project_journal_entries",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId", "spaceId", "userId"], concurrently: true },
      { fields: ["sourceConversationId"], concurrently: true },
    ],
  }
);

UserProjectDigestModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  onDelete: "RESTRICT",
});

UserProjectDigestModel.belongsTo(ConversationModel, {
  foreignKey: { name: "sourceConversationId", allowNull: true },
  onDelete: "RESTRICT",
});

UserProjectDigestModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});

SpaceModel.hasMany(UserProjectDigestModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  as: "userProjectDigests",
});

ConversationModel.hasMany(UserProjectDigestModel, {
  foreignKey: { name: "sourceConversationId", allowNull: false },
  as: "userProjectDigests",
});

UserModel.hasMany(UserProjectDigestModel, {
  foreignKey: { name: "userId", allowNull: false },
  as: "userProjectDigests",
});
