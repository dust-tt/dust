import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CitationType } from "@app/types/assistant/conversation";
import type { AllSupportedFileContentType } from "@app/types/files";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

export type PrecomputedGeneratedFile = {
  fileId: string;
  title: string;
  contentType: AllSupportedFileContentType;
  hidden?: boolean;
};

export class AgentMessageCitationsModel extends WorkspaceAwareModel<AgentMessageCitationsModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentMessageId: ForeignKey<AgentMessageModel["id"]>;
  declare citations: Record<string, CitationType>;
  declare generatedFiles: PrecomputedGeneratedFile[];
}

AgentMessageCitationsModel.init(
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
    citations: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    generatedFiles: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    modelName: "agent_message_citations",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        fields: ["workspaceId", "agentMessageId"],
        name: "agent_message_citations_workspace_agent_msg",
        concurrently: true,
      },
      {
        fields: ["agentMessageId"],
        concurrently: true,
      },
    ],
  }
);

AgentMessageModel.hasOne(AgentMessageCitationsModel, {
  foreignKey: { name: "agentMessageId", allowNull: false },
  onDelete: "CASCADE",
});

AgentMessageCitationsModel.belongsTo(AgentMessageModel, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});
