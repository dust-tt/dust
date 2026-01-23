import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { ConversationModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class ProjectJournalEntryModel extends WorkspaceAwareModel<ProjectJournalEntryModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare spaceId: ForeignKey<SpaceModel["id"]>;
  declare userId: ForeignKey<UserModel["id"]>;
  declare sourceConversationId: ForeignKey<ConversationModel["id"]> | null;

  declare journalEntry: string;

  declare space: NonAttribute<SpaceModel>;
  declare user: NonAttribute<UserModel>;
  declare sourceConversation: NonAttribute<ConversationModel> | null;
}

ProjectJournalEntryModel.init(
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
    journalEntry: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    modelName: "project_journal_entry",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId", "spaceId", "userId"], concurrently: true },
      { fields: ["sourceConversationId"], concurrently: true },
    ],
  }
);

ProjectJournalEntryModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  onDelete: "RESTRICT",
});

ProjectJournalEntryModel.belongsTo(ConversationModel, {
  foreignKey: { name: "sourceConversationId", allowNull: true },
  onDelete: "RESTRICT",
});

ProjectJournalEntryModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});

SpaceModel.hasMany(ProjectJournalEntryModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  as: "projectJournalEntries",
});

ConversationModel.hasMany(ProjectJournalEntryModel, {
  foreignKey: { name: "sourceConversationId", allowNull: false },
  as: "projectJournalEntries",
});

UserModel.hasMany(ProjectJournalEntryModel, {
  foreignKey: { name: "userId", allowNull: false },
  as: "projectJournalEntries",
});
