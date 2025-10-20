import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import type { StepContext } from "@app/lib/actions/types";
import { MCPServerViewModel } from "@app/lib/models/assistant/actions/mcp_server_view";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentStepContentModel } from "@app/lib/models/assistant/agent_step_content";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import { validateJsonSchema } from "@app/lib/utils/json_schemas";
import type { TimeFrame } from "@app/types";
import { isTimeFrame } from "@app/types";

export type AdditionalConfigurationValueType =
  | boolean
  | number
  | string
  | string[];

// Note, in storage, we store the path using "." in the key of the record.
export type AdditionalConfigurationType = Record<
  string,
  AdditionalConfigurationValueType
>;

export class AgentMCPServerConfiguration extends WorkspaceAwareModel<AgentMCPServerConfiguration> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"]>;

  declare sId: string;

  declare timeFrame: TimeFrame | null;
  declare additionalConfiguration: AdditionalConfigurationType;
  declare jsonSchema: JSONSchema | null;

  declare appId: string | null;

  declare secretName: string | null;

  declare mcpServerViewId: ForeignKey<MCPServerViewModel["id"]>;
  declare mcpServerView: NonAttribute<MCPServerViewModel>;

  // Hold the SID of the MCP server if it's an internal one, as a convenience to avoid
  // having to fetch the MCP server view when we need to identify the internal MCP server.
  declare internalMCPServerId: string | null;

  declare name: string | null;

  // This is a temporary override for the tool description when we have tools using datasources or tables
  // to keep backward compatibility with the previous action behavior (like retrieval).
  // It allows us to show the datasource description to the model.
  // Note: singleToolDescriptionOverride is wrong, it should be toolsExtraDescription or something like that.
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
    timeFrame: {
      type: DataTypes.JSONB,
      allowNull: true,
      validate: {
        isValidTimeFrame(value: unknown) {
          if (value === null) {
            return;
          }
          if (!isTimeFrame(value)) {
            throw new Error("Invalid time frame");
          }
        },
      },
    },
    jsonSchema: {
      type: DataTypes.JSONB,
      allowNull: true,
      validate: {
        isValidJSONSchema(value: unknown) {
          if (typeof value !== "object" && typeof value !== "string") {
            throw new Error("jsonSchema is not an object or a string");
          }
          const validationResult = validateJsonSchema(value);
          if (!validationResult.isValid) {
            throw new Error(`Invalid JSON schema: ${validationResult.error}`);
          }
        },
      },
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
    appId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    secretName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    mcpServerViewId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: MCPServerViewModel,
        key: "id",
      },
    },
    internalMCPServerId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    name: {
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
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-13): Remove this index.
      {
        fields: ["agentConfigurationId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "agentConfigurationId"],
        concurrently: true,
        name: "agent_mcp_srv_config_w_id_agent_config_id",
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
  as: "mcpServerConfigurations",
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
  as: "mcpServerView",
});

export class AgentMCPActionModel extends WorkspaceAwareModel<AgentMCPActionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare mcpServerConfigurationId: string;
  declare version: number;
  declare agentMessageId: ForeignKey<AgentMessage["id"]>;
  declare stepContentId: ForeignKey<AgentStepContentModel["id"]>;

  declare status: ToolExecutionStatus;

  declare citationsAllocated: number;
  declare augmentedInputs: Record<string, unknown>;
  declare toolConfiguration: LightMCPToolConfigurationType;
  declare stepContext: StepContext;

  declare outputItems: NonAttribute<AgentMCPActionOutputItem[]>;

  declare agentMessage?: NonAttribute<AgentMessage>;
}

AgentMCPActionModel.init(
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
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "succeeded",
    },
    citationsAllocated: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    augmentedInputs: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    toolConfiguration: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    stepContext: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    modelName: "agent_mcp_action",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "agentMessageId"],
        concurrently: true,
      },
      {
        fields: ["stepContentId"],
        concurrently: true,
      },
      {
        fields: ["workspaceId", "agentMessageId", "stepContentId", "version"],
        name: "agent_mcp_action_workspace_agent_message_step_content_version",
        unique: true,
        concurrently: true,
      },
      {
        fields: ["workspaceId", "agentMessageId", "status"],
        name: "agent_mcp_action_workspace_agent_message_status",
        concurrently: true,
      },
    ],
  }
);

AgentMCPActionModel.belongsTo(AgentMessage, {
  foreignKey: { name: "agentMessageId", allowNull: false },
  as: "agentMessage",
});

AgentMessage.hasMany(AgentMCPActionModel, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

AgentMCPActionModel.belongsTo(AgentStepContentModel, {
  foreignKey: { name: "stepContentId", allowNull: false },
  as: "stepContent",
  onDelete: "RESTRICT",
});

AgentStepContentModel.hasMany(AgentMCPActionModel, {
  foreignKey: { name: "stepContentId", allowNull: false },
  as: "agentMCPActions",
});

export class AgentMCPActionOutputItem extends WorkspaceAwareModel<AgentMCPActionOutputItem> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentMCPActionId: ForeignKey<AgentMCPActionModel["id"]>;
  declare content: CallToolResult["content"][number];
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
        fields: ["workspaceId"],
        concurrently: true,
      },
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

AgentMCPActionModel.hasMany(AgentMCPActionOutputItem, {
  foreignKey: { name: "agentMCPActionId", allowNull: false },
  as: "outputItems",
  onDelete: "CASCADE",
});

AgentMCPActionOutputItem.belongsTo(AgentMCPActionModel, {
  foreignKey: { name: "agentMCPActionId", allowNull: false },
});

AgentMCPActionOutputItem.belongsTo(FileModel, {
  foreignKey: { name: "fileId", allowNull: true },
  onDelete: "SET NULL",
});

/**
 * Configuration of a child agent used by an MCP server.
 * TODO(mcp): move this model in a file dedicated to the configuration blocks, add Resources for
 *  all of them (should be done after cleaning up all the actions).
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
    indexes: [
      // TODO(WORKSPACE_ID_ISOLATION 2025-05-13): Remove index.
      { fields: ["mcpServerConfigurationId"] },
      {
        fields: ["workspaceId", "mcpServerConfigurationId"],
        name: "agent_child_agent_config_workspace_id_mcp_srv_config_id",
        concurrently: true,
      },
    ],
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
