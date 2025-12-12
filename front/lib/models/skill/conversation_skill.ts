import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ConversationSkillOrigin } from "@app/types/assistant/conversation_skills";

export class ConversationSkillModel extends WorkspaceAwareModel<ConversationSkillModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfiguration: NonAttribute<AgentConfigurationModel>;
  declare agentConfigurationId: ForeignKey<AgentConfigurationModel["id"]>;

  declare customSkill: NonAttribute<SkillConfigurationModel> | null;
  declare customSkillId: ForeignKey<SkillConfigurationModel["id"]> | null;
  declare globalSkillId: string | null;

  declare conversationId: ForeignKey<ConversationModel["id"]>;

  declare source: ConversationSkillOrigin;
  declare addedByUserId: ForeignKey<UserModel["id"]> | null;
}

ConversationSkillModel.init(
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
    agentConfigurationId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    customSkillId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    globalSkillId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    conversationId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    source: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    addedByUserId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
  },
  {
    modelName: "conversation_skills",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "conversationId", "agentConfigurationId"],
        name: "conversation_skills_wid_cid_acid",
        unique: true,
      },
    ],
    validate: {
      eitherGlobalOrCustomSkill() {
        const hasCustomSkill = this.customSkillId !== null;
        const hasGlobalSkill = this.globalSkillId !== null;
        if (hasCustomSkill === hasGlobalSkill) {
          throw new Error(
            "Exactly one of customSkillId or globalSkillId must be set"
          );
        }
      },
    },
  }
);

// ConversationSkillModel <> AgentConfiguration
AgentConfigurationModel.hasMany(ConversationSkillModel, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
  onDelete: "RESTRICT",
});
ConversationSkillModel.belongsTo(AgentConfigurationModel, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
  as: "agentConfiguration",
});

// ConversationSkillModel <> SkillConfiguration (custom skill)
SkillConfigurationModel.hasMany(ConversationSkillModel, {
  foreignKey: { name: "customSkillId", allowNull: true },
  onDelete: "RESTRICT",
});
ConversationSkillModel.belongsTo(SkillConfigurationModel, {
  foreignKey: { name: "customSkillId", allowNull: true },
  as: "customSkill",
});

// ConversationSkillModel <> Conversation
ConversationModel.hasMany(ConversationSkillModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "RESTRICT",
});
ConversationSkillModel.belongsTo(ConversationModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  as: "conversation",
});

// ConversationSkillModel <> User (addedBy)
UserModel.hasMany(ConversationSkillModel, {
  foreignKey: { name: "addedByUserId", allowNull: true },
  onDelete: "SET NULL",
});
ConversationSkillModel.belongsTo(UserModel, {
  foreignKey: { name: "addedByUserId", allowNull: true },
  as: "addedByUser",
});
