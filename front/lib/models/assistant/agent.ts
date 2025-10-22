import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import type { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { frontSequelize } from "@app/lib/resources/storage";
import { TemplateModel } from "@app/lib/resources/storage/models/templates";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  AgentConfigurationScope,
  AgentReasoningEffort,
  AgentStatus,
  GlobalAgentStatus,
  ModelIdType,
  ModelProviderIdType,
} from "@app/types";

/**
 * Agent configuration
 */
export class AgentConfiguration extends WorkspaceAwareModel<AgentConfiguration> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare version: number;

  declare status: AgentStatus;
  declare scope: Exclude<AgentConfigurationScope, "global">;
  declare name: string;

  declare description: string;

  declare instructions: string | null;
  declare providerId: ModelProviderIdType;
  declare modelId: ModelIdType;
  declare temperature: number;
  declare reasoningEffort: AgentReasoningEffort | null;
  declare responseFormat?: string;

  declare pictureUrl: string;

  declare authorId: ForeignKey<UserModel["id"]>;

  declare maxStepsPerRun: number;
  // declare visualizationEnabled: boolean;

  declare templateId: ForeignKey<TemplateModel["id"]> | null;

  declare requestedGroupIds: number[][];
  declare requestedSpaceIds: number[];

  declare author: NonAttribute<UserModel>;

  declare mcpServerConfigurations: NonAttribute<AgentMCPServerConfiguration[]>;
}

AgentConfiguration.init(
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
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "active",
    },
    scope: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "workspace",
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    instructions: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    modelId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    temperature: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.7,
    },
    reasoningEffort: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    responseFormat: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      validate: {
        isValidJSON(value: string) {
          if (value) {
            try {
              const parsed = JSON.parse(value);
              if (parsed && typeof parsed !== "object") {
                throw new Error("Response format is invalid JSON");
              }
            } catch (e) {
              throw new Error("Response format is invalid JSON");
            }
          }
        },
      },
    },
    maxStepsPerRun: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    visualizationEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    pictureUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    requestedGroupIds: {
      type: DataTypes.ARRAY(DataTypes.ARRAY(DataTypes.BIGINT)),
      allowNull: false,
      defaultValue: [],
    },
    requestedSpaceIds: {
      type: DataTypes.ARRAY(DataTypes.BIGINT),
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    modelName: "agent_configuration",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId"] },
      { fields: ["workspaceId", "name"] },
      { fields: ["workspaceId", "status", "name"] },
      {
        fields: ["workspaceId", "scope", "authorId"],
        name: "partial_agent_config_active",
        where: {
          status: "active",
        },
      },
      { fields: ["sId"] },
      { fields: ["sId", "version"], unique: true },
      { fields: ["workspaceId", "authorId", "sId"] },
      {
        name: "agent_configuration_unique_active_name",
        fields: ["workspaceId", "name"],
        unique: true,
        where: {
          status: "active",
        },
      },
      { fields: ["status"] },
    ],
  }
);

// Agent config <> Author
UserModel.hasMany(AgentConfiguration, {
  foreignKey: { name: "authorId", allowNull: false },
  onDelete: "RESTRICT",
});
AgentConfiguration.belongsTo(UserModel, {
  foreignKey: { name: "authorId", allowNull: false },
});

/**
 * Global Agent settings
 */
export class GlobalAgentSettings extends WorkspaceAwareModel<GlobalAgentSettings> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentId: string;

  declare status: GlobalAgentStatus;
}
GlobalAgentSettings.init(
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
    agentId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "disabled",
    },
  },
  {
    modelName: "global_agent_settings",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId"] },
      { fields: ["workspaceId", "agentId"], unique: true },
    ],
  }
);
TemplateModel.hasOne(AgentConfiguration, {
  foreignKey: { name: "templateId", allowNull: true },
  onDelete: "SET NULL",
});

AgentConfiguration.belongsTo(TemplateModel, {
  foreignKey: { name: "templateId", allowNull: true },
});

export class AgentUserRelation extends WorkspaceAwareModel<AgentUserRelation> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfiguration: string;

  declare favorite: boolean;

  declare userId: ForeignKey<UserModel["id"]>;
}

AgentUserRelation.init(
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
    // This is the agentConfiguration.sId as this relation is preserved across version changes.
    agentConfiguration: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    favorite: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    modelName: "agent_user_relation",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId", "userId"] },
      {
        fields: ["workspaceId", "agentConfiguration", "userId"],
        unique: true,
        name: "agent_user_relation_config_workspace_user_idx",
      },
    ],
  }
);

UserModel.hasMany(AgentUserRelation, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
AgentUserRelation.belongsTo(UserModel, {
  foreignKey: { allowNull: false },
});
