import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import {
  AgentMessageModel,
  ConversationModel,
} from "@app/lib/models/agent/conversation";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { AgentMessageSkillSource } from "@app/types/assistant/agent_message_skills";

export class AgentMessageSkillModel extends WorkspaceAwareModel<AgentMessageSkillModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfiguration: NonAttribute<AgentConfigurationModel>;
  declare agentConfigurationId: ForeignKey<AgentConfigurationModel["id"]>;

  declare isActive: boolean;

  declare customSkill: NonAttribute<SkillConfigurationModel> | null;
  declare customSkillId: ForeignKey<SkillConfigurationModel["id"]> | null;
  declare globalSkillId: string | null;

  declare agentMessageId: ForeignKey<AgentMessageModel["id"]>;
  declare conversationId: ForeignKey<ConversationModel["id"]>;

  declare source: AgentMessageSkillSource;
  declare addedByUserId: ForeignKey<UserModel["id"]> | null;
}

AgentMessageSkillModel.init(
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
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    customSkillId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    globalSkillId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    agentMessageId: {
      type: DataTypes.BIGINT,
      allowNull: false,
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
    modelName: "agent_message_skills",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: [
          "workspaceId",
          "conversationId",
          "agentConfigurationId",
          "isActive",
        ],
        name: "agent_message_skills_wid_cid_acid_active",
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

// AgentMessageSkill <> AgentConfiguration
AgentConfigurationModel.hasMany(AgentMessageSkillModel, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
  onDelete: "RESTRICT",
});
AgentMessageSkillModel.belongsTo(AgentConfigurationModel, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
  as: "agentConfiguration",
});

// AgentMessageSkill <> SkillConfiguration (custom skill)
SkillConfigurationModel.hasMany(AgentMessageSkillModel, {
  foreignKey: { name: "customSkillId", allowNull: true },
  onDelete: "RESTRICT",
});
AgentMessageSkillModel.belongsTo(SkillConfigurationModel, {
  foreignKey: { name: "customSkillId", allowNull: true },
  as: "customSkill",
});

// AgentMessageSkill <> AgentMessage
AgentMessageModel.hasMany(AgentMessageSkillModel, {
  foreignKey: { name: "agentMessageId", allowNull: false },
  onDelete: "RESTRICT",
});
AgentMessageSkillModel.belongsTo(AgentMessageModel, {
  foreignKey: { name: "agentMessageId", allowNull: false },
  as: "agentMessage",
});

// AgentMessageSkill <> Conversation
ConversationModel.hasMany(AgentMessageSkillModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "RESTRICT",
});
AgentMessageSkillModel.belongsTo(ConversationModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  as: "conversation",
});

// AgentMessageSkill <> User (addedBy)
UserModel.hasMany(AgentMessageSkillModel, {
  foreignKey: { name: "addedByUserId", allowNull: true },
  onDelete: "SET NULL",
});
AgentMessageSkillModel.belongsTo(UserModel, {
  foreignKey: { name: "addedByUserId", allowNull: true },
  as: "addedByUser",
});
