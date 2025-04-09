import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import type { MCPToolResultContent } from "@app/lib/actions/mcp_actions";
import { MCPServerViewModel } from "@app/lib/models/assistant/actions/mcp_server_view";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class AgentMCPServerConfiguration extends WorkspaceAwareModel<AgentMCPServerConfiguration> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;

  declare sId: string;

  declare additionalConfiguration: Record<string, boolean | number | string>;

  declare mcpServerViewId: ForeignKey<MCPServerViewModel["id"]>;

  // This is a temporary override for the tool name and description when we only have one tool
  // to keep backward compatibility with the previous action behavior (like retrieval).
  declare singleToolNameOverride: string | null;
  declare singleToolDescriptionOverride: string | null;
}

AgentMCPServerConfiguration.init(
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
    additionalConfiguration: {
      type: DataTypes.JSONB,
      allowNull: false,
      validate: {
        isValidJSON(value: any) {
          if (typeof value === "string") {
            let parsed;
            try {
              parsed = JSON.parse(value);
            } catch (e) {
              throw new Error("additionalConfiguration is invalid JSON");
            }
            if (parsed && typeof parsed !== "object") {
              throw new Error(
                "additionalConfiguration couldn't be parsed to an object"
              );
            }
          } else if (typeof value !== "object") {
            throw new Error("additionalConfiguration is not an object");
          }
        },
      },
    },
    mcpServerViewId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: MCPServerViewModel,
        key: "id",
      },
    },
    singleToolNameOverride: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    singleToolDescriptionOverride: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "agent_mcp_server_configuration",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["agentConfigurationId"],
        concurrently: true,
      },
      {
        unique: true,
        fields: ["sId"],
        concurrently: true,
      },
    ],
  }
);

AgentConfiguration.hasMany(AgentMCPServerConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});
AgentMCPServerConfiguration.belongsTo(AgentConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});

MCPServerViewModel.hasMany(AgentMCPServerConfiguration, {
  foreignKey: { name: "mcpServerViewId", allowNull: false },
  onDelete: "RESTRICT",
});
AgentMCPServerConfiguration.belongsTo(MCPServerViewModel, {
  foreignKey: { name: "mcpServerViewId", allowNull: false },
});

export class AgentMCPAction extends WorkspaceAwareModel<AgentMCPAction> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare mcpServerConfigurationId: string;

  declare params: Record<string, unknown>;

  declare functionCallId: string | null;
  declare functionCallName: string | null;

  declare step: number;
  declare agentMessageId: ForeignKey<AgentMessage["id"]>;

  declare isError: boolean;
  declare executionState:
    | "pending"
    | "allowed_explicitly"
    | "allowed_implicitly"
    | "denied";

  declare outputItems: NonAttribute<AgentMCPActionOutputItem[]>;
}

AgentMCPAction.init(
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
    mcpServerConfigurationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    params: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    functionCallId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    functionCallName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    step: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    executionState: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [
          ["pending", "allowed_explicitly", "allowed_implicitly", "denied"],
        ],
      },
    },
    isError: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    modelName: "agent_mcp_action",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["agentMessageId"],
        concurrently: true,
      },
    ],
  }
);

AgentMCPAction.belongsTo(AgentMessage, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

AgentMessage.hasMany(AgentMCPAction, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

export class AgentMCPActionOutputItem extends WorkspaceAwareModel<AgentMCPActionOutputItem> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentMCPActionId: ForeignKey<AgentMCPAction["id"]>;
  declare content: MCPToolResultContent;
  declare fileId: ForeignKey<FileModel["id"]> | null;

  declare file: NonAttribute<FileModel>;
}

AgentMCPActionOutputItem.init(
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
    content: {
      type: DataTypes.JSONB,
      allowNull: false,
      validate: {
        isValidContent(value: unknown) {
          if (!value || typeof value !== "object") {
            throw new Error("Content must be an object");
          }
          const content = value as { type: string };
          if (!["text", "image", "resource"].includes(content.type)) {
            throw new Error("Invalid content type");
          }
        },
      },
    },
  },
  {
    modelName: "agent_mcp_action_output_item",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["agentMCPActionId"],
        concurrently: true,
      },
      {
        fields: ["fileId"],
        concurrently: true,
      },
    ],
  }
);

AgentMCPAction.hasMany(AgentMCPActionOutputItem, {
  foreignKey: { name: "agentMCPActionId", allowNull: false },
  as: "outputItems",
  onDelete: "CASCADE",
});

AgentMCPActionOutputItem.belongsTo(AgentMCPAction, {
  foreignKey: { name: "agentMCPActionId", allowNull: false },
});

AgentMCPActionOutputItem.belongsTo(FileModel, {
  foreignKey: { name: "fileId", allowNull: true },
  onDelete: "SET NULL",
});

/**
 * Configuration of a child agent used by an MCP server.
 * TODO(mcp): move this model in a file dedicated to the configuration blocks, add Resources for all of them.
 */
export class AgentChildAgentConfiguration extends WorkspaceAwareModel<AgentChildAgentConfiguration> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: string;

  declare mcpServerConfigurationId: ForeignKey<
    AgentMCPServerConfiguration["id"]
  >;
}
AgentChildAgentConfiguration.init(
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
    agentConfigurationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "agent_child_agent_configuration",
    indexes: [{ fields: ["mcpServerConfigurationId"] }],
    sequelize: frontSequelize,
  }
);

// MCP server configuration <> Child agent configuration
AgentMCPServerConfiguration.hasMany(AgentChildAgentConfiguration, {
  foreignKey: { name: "mcpServerConfigurationId", allowNull: false },
  onDelete: "RESTRICT",
});
AgentChildAgentConfiguration.belongsTo(AgentMCPServerConfiguration, {
  foreignKey: { name: "mcpServerConfigurationId", allowNull: false },
});
