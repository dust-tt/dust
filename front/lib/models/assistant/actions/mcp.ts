import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { AVAILABLE_INTERNAL_MCPSERVER_IDS } from "@app/lib/actions/constants";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { MCPToolResultContent } from "@app/lib/actions/mcp_actions";
import { RemoteMCPServer } from "@app/lib/models/assistant/actions/remote_mcp_server";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import { assertNever } from "@app/types";

export class AgentMCPServerConfiguration extends WorkspaceAwareModel<AgentMCPServerConfiguration> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;

  declare sId: string;

  declare serverType: "internal" | "remote";

  declare internalMCPServerId:
    | MCPServerConfigurationType["internalMCPServerId"]
    | null;

  declare remoteMCPServerId: ForeignKey<RemoteMCPServer["id"]> | null;
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
    serverType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [["internal", "remote"]],
      },
    },
    internalMCPServerId: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isIn: [AVAILABLE_INTERNAL_MCPSERVER_IDS],
      },
    },
    remoteMCPServerId: {
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
    hooks: {
      beforeValidate: (config: AgentMCPServerConfiguration) => {
        switch (config.serverType) {
          case "internal":
            if (!config.internalMCPServerId) {
              throw new Error(
                "internalMCPServerId is required for serverType internal"
              );
            }
            if (config.remoteMCPServerId) {
              throw new Error(
                "remoteMCPServerId is not allowed for serverType internal"
              );
            }
            break;
          case "remote":
            if (!config.remoteMCPServerId) {
              throw new Error(
                "remoteMCPServerId is required for serverType remote"
              );
            }
            if (config.internalMCPServerId) {
              throw new Error(
                "internalMCPServerId is not allowed for serverType remote"
              );
            }
            break;
          default:
            assertNever(config.serverType);
        }
      },
    },
  }
);

AgentConfiguration.hasMany(AgentMCPServerConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});
AgentMCPServerConfiguration.belongsTo(AgentConfiguration, {
  foreignKey: { name: "agentConfigurationId", allowNull: false },
});

RemoteMCPServer.hasMany(AgentMCPServerConfiguration, {
  foreignKey: { name: "remoteMCPServerId", allowNull: true },
  onDelete: "RESTRICT",
});
AgentMCPServerConfiguration.belongsTo(RemoteMCPServer, {
  foreignKey: { name: "remoteMCPServerId", allowNull: true },
});

export class AgentMCPAction extends WorkspaceAwareModel<AgentMCPAction> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare serverType: MCPServerConfigurationType["serverType"];
  declare internalMCPServerId: MCPServerConfigurationType["internalMCPServerId"];
  declare remoteMCPServerId: MCPServerConfigurationType["remoteMCPServerId"];
  // TODO(mcp): With client actions, we will likely add a way to reference an object representing the client-side server.
  declare mcpServerConfigurationId: string;

  declare params: Record<string, unknown>;

  declare functionCallId: string | null;
  declare functionCallName: string | null;

  declare step: number;
  declare agentMessageId: ForeignKey<AgentMessage["id"]>;

  declare isError: boolean;
  declare executionState:
    | "pending"
    | "allowed_explicitely"
    | "allowed_implicitely"
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
          ["pending", "allowed_explicitely", "allowed_implicitely", "denied"],
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
          if (!["text", "image", "embedded_resource"].includes(content.type)) {
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
