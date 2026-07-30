import { ConversationModel } from "@app/lib/models/agent/conversation";
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
  declare statusReason: string | null;
  declare terminalAt: Date | null;

  declare conversationId: ForeignKey<ConversationModel["id"]>;
  declare createdByUserId: ForeignKey<UserModel["id"]>;

  declare conversation?: NonAttribute<ConversationModel>;
  declare createdByUser?: NonAttribute<UserModel>;
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
    statusReason: {
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
        fields: ["createdByUserId"],
        name: "conversation_goals_created_by_user_id",
        concurrently: true,
      },
      {
        unique: true,
        fields: ["workspaceId", "conversationId"],
        name: "conversation_goals_one_unfinished",
        where: {
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

UserModel.hasMany(ConversationGoalModel, {
  foreignKey: { name: "createdByUserId", allowNull: false },
  onDelete: "RESTRICT",
});
ConversationGoalModel.belongsTo(UserModel, {
  foreignKey: { name: "createdByUserId", allowNull: false },
});
