import { CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS } from "@app/lib/constants/credits";
import type { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { frontSequelize } from "@app/lib/resources/storage";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
} from "@app/lib/resources/storage/data_types";
import { TemplateModel } from "@app/lib/resources/storage/models/templates";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  AgentConfigurationScope,
  AgentReinforcementMode,
  AgentStatus,
  GlobalAgentStatus,
} from "@app/types/assistant/agent";
import type {
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";

/**
 * @cc [owner:sfriquet,label:backend] agent-current-version-pointer
 * `currentVersion` MUST equal the highest `version` among the agent's rows in
 * `agent_configurations`, and an agent MUST NOT exist without such a row. A transaction that
 * inserts a configuration row MUST leave `currentVersion` satisfying this before it commits
 * (`AgentResource.setCurrentConfiguration`); a transaction that deletes configuration rows MUST
 * either leave the highest remaining row matched by `currentVersion` or remove the identity row
 * entirely (`AgentResource.delete`). The current configuration is the row matching
 * `(agentId, version) = (agents.id, agents.currentVersion)`, served by that unique index.
 */
export class AgentModel extends WorkspaceAwareModel<AgentModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;

  // Every agent starts at version 0, which is also the column default.
  declare currentVersion: CreationOptional<number>;

  declare name: string | null;
  declare status: AgentStatus | null;
  declare scope: Exclude<AgentConfigurationScope, "global"> | null;
  declare reinforcement: AgentReinforcementMode | null;
  declare lastReinforcementAnalysisAt: Date | null;
  declare templateId: ForeignKey<TemplateModel["id"]> | null;
}

AgentModel.init(
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
    currentVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    name: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    scope: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    reinforcement: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastReinforcementAnalysisAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    modelName: "agent",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["sId"], unique: true },
      { fields: ["workspaceId"], concurrently: true },
      { fields: ["workspaceId", "status", "scope"], concurrently: true },
      { fields: ["templateId"], concurrently: true },
      {
        name: "agent_unique_active_name",
        fields: ["workspaceId", "name"],
        unique: true,
        where: {
          status: "active",
        },
        concurrently: true,
      },
    ],
  }
);

/**
 * Agent configuration
 */
export class AgentConfigurationModel extends WorkspaceAwareModel<AgentConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare version: number;
  declare agentId: ForeignKey<AgentModel["id"]>;

  declare status: AgentStatus;
  declare scope: Exclude<AgentConfigurationScope, "global">;
  declare name: string;

  declare description: string;

  declare instructions: string | null;
  declare instructionsHtml: string | null;
  declare providerId: ModelProviderIdType;
  declare modelId: ModelIdType;
  declare temperature: number;
  declare reasoningEffort: ReasoningEffort | null;
  declare responseFormat?: string;

  declare pictureUrl: string;

  declare authorId: ForeignKey<UserModel["id"]>;

  declare maxStepsPerRun: number;
  // declare visualizationEnabled: boolean;

  declare templateId: ForeignKey<TemplateModel["id"]> | null;

  declare reinforcement: AgentReinforcementMode;

  declare lastReinforcementAnalysisAt: Date | null;

  // NULL means the credit spend checkpoint is off for this agent, any value means it is on. Stored in
  // AWU credits so a per-agent threshold can be added later.
  declare creditSpendCheckpointThresholdAwuCredits: CreationOptional<
    number | null
  >;

  declare requestedSpaceIds: number[];

  declare author: NonAttribute<UserModel>;

  declare mcpServerConfigurations: NonAttribute<
    AgentMCPServerConfigurationModel[]
  >;
}

AgentConfigurationModel.init(
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
    agentId: {
      type: DataTypes.BIGINT,
      allowNull: false,
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
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
    },
    description: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
    },
    instructions: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: true,
    },
    instructionsHtml: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
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
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
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
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
    },
    reinforcement: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "auto",
    },
    lastReinforcementAnalysisAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    creditSpendCheckpointThresholdAwuCredits: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS,
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
      {
        fields: ["workspaceId", "scope", "id"],
        name: "partial_agent_config_active_scope_id",
        where: {
          status: "active",
        },
      },
      { fields: ["sId"] },
      { fields: ["sId", "version"], unique: true },
      { fields: ["agentId"], concurrently: true },
      { fields: ["agentId", "version"], unique: true, concurrently: true },
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

AgentModel.hasMany(AgentConfigurationModel, {
  foreignKey: { name: "agentId", allowNull: false },
  onDelete: "RESTRICT",
});
AgentConfigurationModel.belongsTo(AgentModel, {
  foreignKey: { name: "agentId", allowNull: false },
  onDelete: "RESTRICT",
});

// Agent config <> Author
UserModel.hasMany(AgentConfigurationModel, {
  foreignKey: { name: "authorId", allowNull: false },
  onDelete: "RESTRICT",
});
AgentConfigurationModel.belongsTo(UserModel, {
  foreignKey: { name: "authorId", allowNull: false },
});

/**
 * Global Agent settings
 */
export class GlobalAgentSettingsModel extends WorkspaceAwareModel<GlobalAgentSettingsModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentId: string;

  declare status: GlobalAgentStatus;
}
GlobalAgentSettingsModel.init(
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
TemplateModel.hasOne(AgentConfigurationModel, {
  foreignKey: { name: "templateId", allowNull: true },
  onDelete: "SET NULL",
});

AgentConfigurationModel.belongsTo(TemplateModel, {
  foreignKey: { name: "templateId", allowNull: true },
});

TemplateModel.hasMany(AgentModel, {
  foreignKey: { name: "templateId", allowNull: true },
  onDelete: "SET NULL",
});
AgentModel.belongsTo(TemplateModel, {
  foreignKey: { name: "templateId", allowNull: true },
});

export class AgentUserRelationModel extends WorkspaceAwareModel<AgentUserRelationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfiguration: string;

  declare favorite: boolean;

  declare userId: ForeignKey<UserModel["id"]>;
}

AgentUserRelationModel.init(
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

UserModel.hasMany(AgentUserRelationModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
AgentUserRelationModel.belongsTo(UserModel, {
  foreignKey: { allowNull: false },
});
