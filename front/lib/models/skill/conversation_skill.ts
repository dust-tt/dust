import type { CreationOptional, ForeignKey, ModelAttributes } from "sequelize";
import { DataTypes } from "sequelize";

import {
  AgentMessageModel,
  ConversationModel,
} from "@app/lib/models/agent/conversation";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ConversationSkillOrigin } from "@app/types/assistant/conversation_skills";

const SKILL_IN_CONVERSATION_MODEL_ATTRIBUTES = {
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
    type: DataTypes.STRING,
    allowNull: true,
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
  conversationId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: ConversationModel,
      key: "id",
    },
  },
  source: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  addedByUserId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: UserModel,
      key: "id",
    },
  },
} as const satisfies ModelAttributes;

/**
 * Shared validation for skill in conversation models.
 * Ensures exactly one of customSkillId or globalSkillId is set.
 */
function eitherGlobalOrCustomSkillValidation(this: {
  customSkillId: unknown;
  globalSkillId: unknown;
}) {
  const hasCustomSkill = this.customSkillId !== null;
  const hasGlobalSkill = this.globalSkillId !== null;
  if (hasCustomSkill === hasGlobalSkill) {
    throw new Error(
      "Exactly one of customSkillId or globalSkillId must be set"
    );
  }
}

export class ConversationSkillModel extends WorkspaceAwareModel<ConversationSkillModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: string | null;

  declare customSkillId: ForeignKey<SkillConfigurationModel["id"]> | null;
  declare globalSkillId: string | null;

  declare conversationId: ForeignKey<ConversationModel["id"]>;

  declare source: ConversationSkillOrigin;
  declare addedByUserId: ForeignKey<UserModel["id"]> | null;
}

ConversationSkillModel.init(SKILL_IN_CONVERSATION_MODEL_ATTRIBUTES, {
  modelName: "conversation_skills",
  sequelize: frontSequelize,
  indexes: [
    {
      fields: ["workspaceId", "conversationId", "agentConfigurationId"],
      name: "idx_conversation_skills_workspace_conv_agent",
    },
  ],
  validate: {
    eitherGlobalOrCustomSkill: eitherGlobalOrCustomSkillValidation,
  },
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

export class AgentMessageSkillModel extends ConversationSkillModel {
  declare agentMessageId: ForeignKey<AgentMessageModel["id"]>;
}

AgentMessageSkillModel.init(
  {
    ...SKILL_IN_CONVERSATION_MODEL_ATTRIBUTES,
    agentMessageId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: AgentMessageModel,
        key: "id",
      },
    },
  },
  {
    modelName: "agent_message_skills",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "agentMessageId"],
        name: "idx_agent_message_skills_workspace_message",
      },
    ],
    validate: {
      eitherGlobalOrCustomSkill: eitherGlobalOrCustomSkillValidation,
    },
  }
);

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
