import type {
  CreationOptional,
  ForeignKey,
  Model,
  ModelAttributes,
  NonAttribute,
} from "sequelize";
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
import type { ConversationSkillOrigin } from "@app/types/assistant/conversation_skills";

/**
 * Shared attributes between ConversationSkillModel and AgentMessageSkillModel.
 */
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
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: AgentConfigurationModel,
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
} as const satisfies ModelAttributes<Model>;

/**
 * Shared validation for skill in conversation models.
 * Ensures exactly one of customSkillId or globalSkillId is set.
 * Used in Sequelize's validate option where `this` is the model instance.
 */
function eitherGlobalOrCustomSkillValidation(
  this: { customSkillId: unknown; globalSkillId: unknown }
) {
  const hasCustomSkill = this.customSkillId !== null;
  const hasGlobalSkill = this.globalSkillId !== null;
  if (hasCustomSkill === hasGlobalSkill) {
    throw new Error("Exactly one of customSkillId or globalSkillId must be set");
  }
}

// ConversationSkillModel

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

ConversationSkillModel.init(SKILL_IN_CONVERSATION_MODEL_ATTRIBUTES, {
  modelName: "conversation_skills",
  sequelize: frontSequelize,
  indexes: [],
  validate: {
    eitherGlobalOrCustomSkill: eitherGlobalOrCustomSkillValidation,
  },
});

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

// AgentMessageSkillModel

export class AgentMessageSkillModel extends WorkspaceAwareModel<AgentMessageSkillModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfiguration: NonAttribute<AgentConfigurationModel>;
  declare agentConfigurationId: ForeignKey<AgentConfigurationModel["id"]>;

  declare customSkill: NonAttribute<SkillConfigurationModel> | null;
  declare customSkillId: ForeignKey<SkillConfigurationModel["id"]> | null;
  declare globalSkillId: string | null;

  declare agentMessageId: ForeignKey<AgentMessageModel["id"]>;
  declare conversationId: ForeignKey<ConversationModel["id"]>;

  declare source: ConversationSkillOrigin;
  declare addedByUserId: ForeignKey<UserModel["id"]> | null;
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
    indexes: [],
    validate: {
      eitherGlobalOrCustomSkill: eitherGlobalOrCustomSkillValidation,
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
