import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { AgentContentItemType } from "@app/types/assistant/agent_message_content";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";

export class AgentStepContentModel extends WorkspaceAwareModel<AgentStepContentModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentMessageId: ForeignKey<AgentMessageModel["id"]>;
  declare step: number;
  declare index: number;
  declare version: number;
  declare type: AgentContentItemType["type"];
  declare value: AgentContentItemType;
  // dustRunId of the model run that emitted this content. Anchors consumption attribution: it lets
  // an async job map a RunUsage (RunModel.dustRunId) to the step contents that run produced.
  // Nullable: backfilled null for existing rows, and content not produced by a model run may lack
  // one. Not indexed on purpose: the job fetches by agentMessageId then groups by dustRunId.
  declare dustRunId: string | null;

  declare agentMessage?: NonAttribute<AgentMessageModel>;
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
        isIn: [
          [
            "text_content",
            "reasoning",
            "function_call",
            "error",
            "provider_passthrough",
          ],
        ],
      },
    },
    value: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    dustRunId: {
      type: DataTypes.STRING,
      allowNull: true,
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
      {
        concurrently: true,
        fields: ["workspaceId", "agentMessageId"],
        name: "agent_step_contents_workspace_id_text_content_idx",
        where: {
          type: "text_content",
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
