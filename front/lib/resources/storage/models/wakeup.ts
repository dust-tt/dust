import type { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  WakeUpScheduleType,
  WakeUpStatus,
} from "@app/types/assistant/wakeups";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

export class WakeUpModel extends WorkspaceAwareModel<WakeUpModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare conversationId: ForeignKey<ConversationModel["id"]>;
  declare userId: ForeignKey<UserModel["id"]>;
  declare agentConfigurationId: ForeignKey<AgentConfigurationModel["sId"]>;
  declare scheduleType: WakeUpScheduleType;
  declare fireAt: Date | null;
  declare cronExpression: string | null;
  declare cronTimezone: string | null;
  declare reason: string;
  declare status: CreationOptional<WakeUpStatus>;
  declare fireCount: CreationOptional<number>;
}

WakeUpModel.init(
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
    conversationId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: ConversationModel,
        key: "id",
      },
    },
    userId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: UserModel,
        key: "id",
      },
    },
    agentConfigurationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    scheduleType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fireAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    cronExpression: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    cronTimezone: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "scheduled",
    },
    fireCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    modelName: "wake_up",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "conversationId", "status"],
        name: "wake_ups_workspace_id_conversation_id_status_idx",
        concurrently: true,
      },
      {
        fields: ["workspaceId", "userId"],
        name: "wake_ups_workspace_id_user_id_idx",
        concurrently: true,
      },
      {
        fields: ["workspaceId", "status"],
        name: "wake_ups_workspace_id_status_idx",
        concurrently: true,
      },
    ],
  }
);

ConversationModel.hasMany(WakeUpModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "RESTRICT",
});

WakeUpModel.belongsTo(ConversationModel, {
  foreignKey: { name: "conversationId", allowNull: false },
});

UserModel.hasMany(WakeUpModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});

WakeUpModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
});
