import type { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
} from "@app/lib/resources/storage/data_types";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ConversationContextMode } from "@app/types/assistant/conversation_context_mode";
import { CONVERSATION_CONTEXT_MODES } from "@app/types/assistant/conversation_context_mode";
import type {
  WakeUpScheduleType,
  WakeUpStatus,
} from "@app/types/assistant/wakeups";
import type { CreationOptional, ForeignKey } from "sequelize";

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
  // Context mode applied to every message this wake-up posts. Read from this row at fire time,
  // never from `reason` or any generated text. Legacy: null resolves to "full".
  declare conversationContextMode: CreationOptional<ConversationContextMode>;
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
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: true,
      defaultValue: null,
    },
    cronTimezone: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: true,
      defaultValue: null,
    },
    reason: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
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
    conversationContextMode: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: "full",
      validate: {
        isIn: [[...CONVERSATION_CONTEXT_MODES]],
      },
    },
  },
  {
    modelName: "wake_up",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["conversationId"],
        name: "wake_ups_conversation_id",
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
      {
        fields: ["workspaceId", "agentConfigurationId"],
        name: "wake_ups_workspace_id_agent_configuration_id_idx",
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
