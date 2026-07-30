import {
  AgentMessageModel,
  ConversationModel,
} from "@app/lib/models/agent/conversation";
import { ConversationBranchModel } from "@app/lib/models/agent/conversation_branch";
import { frontSequelize } from "@app/lib/resources/storage";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
  Op,
} from "@app/lib/resources/storage/data_types";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { GoalStatus } from "@app/types/assistant/goal";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";

export const UNFINISHED_GOAL_STATUSES: GoalStatus[] = [
  "active",
  "paused",
  "blocked",
];

export class ConversationGoalModel extends WorkspaceAwareModel<ConversationGoalModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare objective: string;
  declare status: GoalStatus;
  declare reason: string | null;
  declare terminalAt: Date | null;

  declare conversationId: ForeignKey<ConversationModel["id"]>;
  declare branchId: ForeignKey<ConversationBranchModel["id"]> | null;
  declare createdByUserId: ForeignKey<UserModel["id"]>;
  declare currentAgentMessageId: ForeignKey<AgentMessageModel["id"]>;
  declare lastAgentMessageId: ForeignKey<AgentMessageModel["id"]> | null;

  declare conversation?: NonAttribute<ConversationModel>;
  declare branch?: NonAttribute<ConversationBranchModel | null>;
  declare createdByUser?: NonAttribute<UserModel>;
  declare currentAgentMessage?: NonAttribute<AgentMessageModel>;
  declare lastAgentMessage?: NonAttribute<AgentMessageModel | null>;
}

ConversationGoalModel.init(
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
    objective: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    reason: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: true,
    },
    terminalAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    modelName: "conversation_goal",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["conversationId"],
        name: "conversation_goals_conversation_id",
        concurrently: true,
      },
      {
        fields: ["branchId"],
        name: "conversation_goals_branch_id",
        concurrently: true,
      },
      {
        fields: ["createdByUserId"],
        name: "conversation_goals_created_by_user_id",
        concurrently: true,
      },
      {
        fields: ["currentAgentMessageId"],
        name: "conversation_goals_current_agent_message_id",
        concurrently: true,
      },
      {
        fields: ["lastAgentMessageId"],
        name: "conversation_goals_last_agent_message_id",
        concurrently: true,
      },
      {
        unique: true,
        fields: ["workspaceId", "conversationId"],
        name: "conversation_goals_one_unfinished_root",
        where: {
          branchId: null,
          status: { [Op.in]: UNFINISHED_GOAL_STATUSES },
        },
      },
      {
        unique: true,
        fields: ["workspaceId", "conversationId", "branchId"],
        name: "conversation_goals_one_unfinished_branch",
        where: {
          branchId: { [Op.not]: null },
          status: { [Op.in]: UNFINISHED_GOAL_STATUSES },
        },
      },
    ],
  }
);

ConversationModel.hasMany(ConversationGoalModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "RESTRICT",
});
ConversationGoalModel.belongsTo(ConversationModel, {
  foreignKey: { name: "conversationId", allowNull: false },
});

ConversationBranchModel.hasMany(ConversationGoalModel, {
  foreignKey: { name: "branchId", allowNull: true },
  onDelete: "RESTRICT",
});
ConversationGoalModel.belongsTo(ConversationBranchModel, {
  foreignKey: { name: "branchId", allowNull: true },
});

UserModel.hasMany(ConversationGoalModel, {
  foreignKey: { name: "createdByUserId", allowNull: false },
  onDelete: "RESTRICT",
});
ConversationGoalModel.belongsTo(UserModel, {
  foreignKey: { name: "createdByUserId", allowNull: false },
});

AgentMessageModel.hasMany(ConversationGoalModel, {
  as: "currentConversationGoals",
  foreignKey: { name: "currentAgentMessageId", allowNull: false },
  onDelete: "RESTRICT",
});
ConversationGoalModel.belongsTo(AgentMessageModel, {
  as: "currentAgentMessage",
  foreignKey: { name: "currentAgentMessageId", allowNull: false },
});

AgentMessageModel.hasMany(ConversationGoalModel, {
  as: "lastConversationGoals",
  foreignKey: { name: "lastAgentMessageId", allowNull: true },
  onDelete: "RESTRICT",
});
ConversationGoalModel.belongsTo(AgentMessageModel, {
  as: "lastAgentMessage",
  foreignKey: { name: "lastAgentMessageId", allowNull: true },
});
