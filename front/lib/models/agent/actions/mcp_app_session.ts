import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import {
  AgentMCPActionModel,
  AgentMCPActionOutputItemModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

/**
 * MCP App Session model - stores sessions for MCP tools that return UI metadata.
 * When a tool returns a resourceUri in its _meta.ui field, a session is created
 * to track the UI rendering context.
 */
export class AgentMCPAppSessionModel extends WorkspaceAwareModel<AgentMCPAppSessionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;

  declare conversationId: string;

  declare agentMessageId: ForeignKey<AgentMessageModel["id"]>;
  declare agentMCPActionId: ForeignKey<AgentMCPActionModel["id"]>;

  // The MCP resource URI that provides the UI content (e.g., "ui://gmail/emails")
  declare resourceUri: string;

  // CSP directives for the iframe (e.g., { "style-src": "'unsafe-inline'" })
  declare csp: Record<string, string> | null;

  // Session state - currently just "active" for POC, can be extended later
  declare state: "active" | "closed";

  declare agentMessage: NonAttribute<AgentMessageModel>;
  declare agentMCPAction: NonAttribute<AgentMCPActionModel>;
  declare outputItem: NonAttribute<AgentMCPActionOutputItemModel>;
}

AgentMCPAppSessionModel.init(
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
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    conversationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    resourceUri: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    csp: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "active",
    },
  },
  {
    modelName: "agent_mcp_app_session",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        fields: ["sId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "conversationId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "agentMessageId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "agentMCPActionId"],
        concurrently: true,
      },
      {
        fields: ["agentMessageId"],
        concurrently: true,
      },
      {
        fields: ["agentMCPActionId"],
        concurrently: true,
      },
    ],
  }
);

// Relationships
AgentMCPAppSessionModel.belongsTo(AgentMessageModel, {
  foreignKey: { name: "agentMessageId", allowNull: false },
  as: "agentMessage",
});

AgentMessageModel.hasMany(AgentMCPAppSessionModel, {
  foreignKey: { name: "agentMessageId", allowNull: false },
  as: "mcpAppSessions",
});

AgentMCPAppSessionModel.belongsTo(AgentMCPActionModel, {
  foreignKey: { name: "agentMCPActionId", allowNull: false },
  as: "agentMCPAction",
});

AgentMCPActionModel.hasMany(AgentMCPAppSessionModel, {
  foreignKey: { name: "agentMCPActionId", allowNull: false },
  as: "mcpAppSessions",
});
