import type {
  AgentUserListStatus,
  DustAppRunConfigurationType,
} from "@dust-tt/types";
import type {
  AgentConfigurationScope,
  AgentStatus,
  GlobalAgentStatus,
} from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import { AgentDatabaseQueryConfiguration } from "@app/lib/models/assistant/actions/database_query";
import { AgentDustAppRunConfiguration } from "@app/lib/models/assistant/actions/dust_app_run";
import { AgentRetrievalConfiguration } from "@app/lib/models/assistant/actions/retrieval";
import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";

/**
 * Configuration of Agent generation.
 */
export class AgentGenerationConfiguration extends Model<
  InferAttributes<AgentGenerationConfiguration>,
  InferCreationAttributes<AgentGenerationConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare prompt: string;
  declare providerId: string;
  declare modelId: string;
  declare temperature: number;
}
AgentGenerationConfiguration.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
    prompt: {
      type: DataTypes.TEXT,
      allowNull: false,
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
  },
  {
    modelName: "agent_generation_configuration",
    sequelize: front_sequelize,
  }
);

/**
 * Agent configuration
 */
export class AgentConfiguration extends Model<
  InferAttributes<AgentConfiguration>,
  InferCreationAttributes<AgentConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare version: number;

  declare status: AgentStatus;
  declare scope: Exclude<AgentConfigurationScope, "global">;
  declare name: string;
  declare description: string;
  declare pictureUrl: string;

  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare authorId: ForeignKey<User["id"]>;
  declare generationConfigurationId: ForeignKey<
    AgentGenerationConfiguration["id"]
  > | null;
  declare retrievalConfigurationId: ForeignKey<
    AgentRetrievalConfiguration["id"]
  > | null;
  declare dustAppRunConfigurationId: ForeignKey<
    AgentDustAppRunConfiguration["id"]
  > | null;

  declare databaseQueryConfigurationId: ForeignKey<
    AgentDatabaseQueryConfiguration["id"]
  > | null;

  declare author: NonAttribute<User>;
  declare generationConfiguration: NonAttribute<AgentGenerationConfiguration>;
  declare retrievalConfiguration: NonAttribute<AgentRetrievalConfiguration>;
  declare dustAppRunConfiguration: NonAttribute<DustAppRunConfigurationType>;
  declare databaseQueryConfiguration: NonAttribute<AgentDatabaseQueryConfiguration>;
}
AgentConfiguration.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
    pictureUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    modelName: "agent_configuration",
    sequelize: front_sequelize,
    indexes: [
      { fields: ["workspaceId"] },
      { fields: ["workspaceId", "name"] },
      { fields: ["workspaceId", "status", "name"] },
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
    ],
    hooks: {
      beforeValidate: (agentConfiguration: AgentConfiguration) => {
        const actionsTypes: (keyof AgentConfiguration)[] = [
          "retrievalConfigurationId",
          "dustAppRunConfigurationId",
          "databaseQueryConfigurationId",
        ];
        const nonNullActionTypes = actionsTypes.filter(
          (field) => agentConfiguration[field] != null
        );
        if (nonNullActionTypes.length > 1) {
          throw new Error(
            "Only one of retrievalConfigurationId, dustAppRunConfigurationId, or databaseQueryConfigurationId can be set"
          );
        }
      },
    },
  }
);

//  Agent config <> Workspace
Workspace.hasMany(AgentConfiguration, {
  foreignKey: { name: "workspaceId", allowNull: false },
  onDelete: "CASCADE",
});
AgentConfiguration.belongsTo(Workspace, {
  foreignKey: { name: "workspaceId", allowNull: false },
});

// Agent config <> Generation config
AgentGenerationConfiguration.hasOne(AgentConfiguration, {
  as: "generationConfiguration",
  foreignKey: { name: "generationConfigurationId", allowNull: true }, // null = no generation set for this Agent
});
AgentConfiguration.belongsTo(AgentGenerationConfiguration, {
  as: "generationConfiguration",
  foreignKey: { name: "generationConfigurationId", allowNull: true }, // null = no generation set for this Agent
});

// Agent config <> Retrieval config
AgentRetrievalConfiguration.hasOne(AgentConfiguration, {
  as: "retrievalConfiguration",
  foreignKey: { name: "retrievalConfigurationId", allowNull: true }, // null = no retrieval action set for this Agent
});
AgentConfiguration.belongsTo(AgentRetrievalConfiguration, {
  as: "retrievalConfiguration",
  foreignKey: { name: "retrievalConfigurationId", allowNull: true }, // null = no retrieval action set for this Agent
});

// Agent config <> DustAppRun config
AgentDustAppRunConfiguration.hasOne(AgentConfiguration, {
  as: "dustAppRunConfiguration",
  foreignKey: { name: "dustAppRunConfigurationId", allowNull: true }, // null = no DutsAppRun action set for this Agent
});
AgentConfiguration.belongsTo(AgentDustAppRunConfiguration, {
  as: "dustAppRunConfiguration",
  foreignKey: { name: "dustAppRunConfigurationId", allowNull: true }, // null = no DutsAppRun action set for this Agent
});

// Agent config <> Database config
AgentDatabaseQueryConfiguration.hasOne(AgentConfiguration, {
  as: "databaseQueryConfiguration",
  foreignKey: { name: "databaseQueryConfigurationId", allowNull: true }, // null = no Database action set for this Agent
});
AgentConfiguration.belongsTo(AgentDatabaseQueryConfiguration, {
  as: "databaseQueryConfiguration",
  foreignKey: { name: "databaseQueryConfigurationId", allowNull: true }, // null = no Database action set for this Agent
});

// Agent config <> Author
User.hasMany(AgentConfiguration, {
  foreignKey: { name: "authorId", allowNull: false },
  onDelete: "CASCADE",
});
AgentConfiguration.belongsTo(User, {
  foreignKey: { name: "authorId", allowNull: false },
});

/**
 * Global Agent settings
 */
export class GlobalAgentSettings extends Model<
  InferAttributes<GlobalAgentSettings>,
  InferCreationAttributes<GlobalAgentSettings>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentId: string;
  declare workspaceId: ForeignKey<Workspace["id"]>;

  declare status: GlobalAgentStatus;
}
GlobalAgentSettings.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
    sequelize: front_sequelize,
    indexes: [
      { fields: ["workspaceId"] },
      { fields: ["workspaceId", "agentId"], unique: true },
    ],
  }
);
//  Global Agent config <> Workspace
Workspace.hasMany(GlobalAgentSettings, {
  foreignKey: { name: "workspaceId", allowNull: false },
  onDelete: "CASCADE",
});
GlobalAgentSettings.belongsTo(Workspace, {
  foreignKey: { name: "workspaceId", allowNull: false },
});

export class AgentUserRelation extends Model<
  InferAttributes<AgentUserRelation>,
  InferCreationAttributes<AgentUserRelation>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfiguration: string;

  declare listStatusOverride: AgentUserListStatus | null;

  declare userId: ForeignKey<User["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
}

AgentUserRelation.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
    listStatusOverride: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "agent_user_relation",
    sequelize: front_sequelize,
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

User.hasMany(AgentUserRelation, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
Workspace.hasMany(AgentUserRelation, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
AgentUserRelation.belongsTo(User, {
  foreignKey: { allowNull: false },
});
AgentUserRelation.belongsTo(Workspace, {
  foreignKey: { allowNull: false },
});
