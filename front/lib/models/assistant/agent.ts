import type {
  AgentConfigurationScope,
  AgentReasoningEffort,
  AgentStatus,
  GlobalAgentStatus,
  ModelIdType,
  ModelProviderIdType,
} from "@dust-tt/types";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { TemplateModel } from "@app/lib/resources/storage/models/templates";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { BaseModel } from "@app/lib/resources/storage/wrappers";

/**
 * Agent configuration
 */
export class AgentConfiguration extends BaseModel<AgentConfiguration> {
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

  declare pictureUrl: string;

  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare authorId: ForeignKey<UserModel["id"]>;

  declare maxStepsPerRun: number;
  declare visualizationEnabled: boolean;

  declare templateId: ForeignKey<TemplateModel["id"]> | null;

  declare groupIds: number[];
  declare requestedGroupIds: number[][];

  declare author: NonAttribute<UserModel>;
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
    // TODO(2024-11-04 flav) `groupIds` clean up.
    groupIds: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      allowNull: false,
      defaultValue: [],
    },
    requestedGroupIds: {
      type: DataTypes.ARRAY(DataTypes.ARRAY(DataTypes.INTEGER)),
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
      { fields: ["authorId"] },
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

//  Agent config <> Workspace
Workspace.hasMany(AgentConfiguration, {
  foreignKey: { name: "workspaceId", allowNull: false },
  onDelete: "RESTRICT",
});
AgentConfiguration.belongsTo(Workspace, {
  foreignKey: { name: "workspaceId", allowNull: false },
});

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
export class GlobalAgentSettings extends BaseModel<GlobalAgentSettings> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentId: string;
  declare workspaceId: ForeignKey<Workspace["id"]>;

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
//  Global Agent config <> Workspace
Workspace.hasMany(GlobalAgentSettings, {
  foreignKey: { name: "workspaceId", allowNull: false },
  onDelete: "RESTRICT",
});
GlobalAgentSettings.belongsTo(Workspace, {
  foreignKey: { name: "workspaceId", allowNull: false },
});

TemplateModel.hasOne(AgentConfiguration, {
  foreignKey: { name: "templateId", allowNull: true },
  onDelete: "SET NULL",
});

AgentConfiguration.belongsTo(TemplateModel, {
  foreignKey: { name: "templateId", allowNull: true },
});

export class AgentUserRelation extends BaseModel<AgentUserRelation> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfiguration: string;

  declare favorite: boolean;

  declare userId: ForeignKey<UserModel["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
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
Workspace.hasMany(AgentUserRelation, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
AgentUserRelation.belongsTo(UserModel, {
  foreignKey: { allowNull: false },
});
AgentUserRelation.belongsTo(Workspace, {
  foreignKey: { allowNull: false },
});
