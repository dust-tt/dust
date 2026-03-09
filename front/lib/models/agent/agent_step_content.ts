import type { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { AgentContentItemType } from "@app/types/assistant/agent_message_content";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

export class AgentStepContentModel extends WorkspaceAwareModel<AgentStepContentModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentMessageId: ForeignKey<AgentMessageModel["id"]>;
  declare step: number;
  declare index: number;
  declare version: number;
  declare type: AgentContentItemType["type"];
  declare value: AgentContentItemType;

  declare agentMessage?: NonAttribute<AgentMessageModel>;
  declare agentMCPActions?: NonAttribute<AgentMCPActionModel[]>;
}

AgentStepContentModel.init(
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
    agentMessageId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: "agent_messages",
        key: "id",
      },
    },
    step: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    index: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [["text_content", "reasoning", "function_call", "error"]],
      },
    },
    value: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "agent_step_content",
    tableName: "agent_step_contents",
    indexes: [
      {
        unique: true,
        concurrently: true,
        fields: ["workspaceId", "agentMessageId", "step", "index", "version"],
        name: "agent_step_contents_workspace_agent_message_step_index_version",
      },
      {
        concurrently: true,
        fields: ["agentMessageId"],
      },
      {
        concurrently: true,
        fields: ["workspaceId", "agentMessageId"],
      },
      {
        concurrently: true,
        fields: ["workspaceId", "agentMessageId"],
        name: "agent_step_contents_workspace_id_idx",
        where: {
          type: "function_call",
        },
      },
    ],
  }
);

AgentStepContentModel.belongsTo(AgentMessageModel, {
  as: "agentMessage",
  foreignKey: {
    name: "agentMessageId",
    allowNull: false,
  },
  onDelete: "RESTRICT",
});

AgentMessageModel.hasMany(AgentStepContentModel, {
  as: "agentStepContents",
  foreignKey: {
    name: "agentMessageId",
    allowNull: false,
  },
  onDelete: "RESTRICT",
});
