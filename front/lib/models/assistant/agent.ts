import type {
  AgentUserListStatus,
  DustAppRunConfigurationType,
  TimeframeUnit,
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

import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";

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
    sequelize: frontSequelize,
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

  declare tablesQueryConfigurationId: ForeignKey<
    AgentTablesQueryConfiguration["id"]
  > | null;

  declare author: NonAttribute<User>;
  declare generationConfiguration: NonAttribute<AgentGenerationConfiguration>;
  declare retrievalConfiguration: NonAttribute<AgentRetrievalConfiguration>;
  declare dustAppRunConfiguration: NonAttribute<DustAppRunConfigurationType>;
  declare tablesQueryConfiguration: NonAttribute<AgentTablesQueryConfiguration>;
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
    sequelize: frontSequelize,
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
          "tablesQueryConfigurationId",
        ];
        const nonNullActionTypes = actionsTypes.filter(
          (field) => agentConfiguration[field] != null
        );
        if (nonNullActionTypes.length > 1) {
          throw new Error(
            "Only one of retrievalConfigurationId, dustAppRunConfigurationId, tablesQueryConfigurationId can be set"
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

// TODO(@fontanierh) TO BE MOVED TO THE tables_query.ts file -- inlined during multi actions migration
// to avoid circular dependencies

export class AgentTablesQueryConfiguration extends Model<
  InferAttributes<AgentTablesQueryConfiguration>,
  InferCreationAttributes<AgentTablesQueryConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"] | null>;

  declare sId: string;
}

AgentTablesQueryConfiguration.init(
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
  },
  {
    modelName: "agent_tables_query_configuration",
    indexes: [
      {
        unique: true,
        fields: ["sId"],
        name: "agent_tables_query_configuration_s_id",
      },
    ],
    sequelize: frontSequelize,
  }
);

// DEPERECATED -- AgentConfig -> TablesQueryConfig (1:1)
AgentTablesQueryConfiguration.hasOne(AgentConfiguration, {
  as: "tablesQueryConfiguration",
  foreignKey: { name: "tablesQueryConfigurationId", allowNull: true }, // null = no Tables action set for this Agent
});
AgentConfiguration.belongsTo(AgentTablesQueryConfiguration, {
  as: "tablesQueryConfiguration",
  foreignKey: { name: "tablesQueryConfigurationId", allowNull: true }, // null = no Tables action set for this Agent
});

// NEW -- AgentConfig -> TablesQueryConfig (1:N)
AgentConfiguration.hasMany(AgentTablesQueryConfiguration, {
  // TODO(@fontanierh) make it non-nullable
  foreignKey: { name: "agentConfigurationId", allowNull: true },
  onDelete: "CASCADE",
});
AgentTablesQueryConfiguration.belongsTo(AgentConfiguration, {
  // TODO(@fontanierh) make it non-nullable
  foreignKey: { name: "agentConfigurationId", allowNull: true },
  onDelete: "CASCADE",
});

// TODO(@fontanierh) TO BE MOVED TO THE retrieval.ts file -- inlined during multi actions migration
// to avoid circular dependencies

export class AgentRetrievalConfiguration extends Model<
  InferAttributes<AgentRetrievalConfiguration>,
  InferCreationAttributes<AgentRetrievalConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"] | null>;

  declare sId: string;

  declare query: "auto" | "none" | "templated";
  declare queryTemplate: string | null;
  declare relativeTimeFrame: "auto" | "none" | "custom";
  declare relativeTimeFrameDuration: number | null;
  declare relativeTimeFrameUnit: TimeframeUnit | null;
  declare topK: number | null;
  declare topKMode: "auto" | "custom";
}

AgentRetrievalConfiguration.init(
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
    query: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "auto",
    },
    queryTemplate: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    relativeTimeFrame: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "auto",
    },
    relativeTimeFrameDuration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    relativeTimeFrameUnit: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    topK: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    topKMode: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "auto",
    },
  },
  {
    modelName: "agent_retrieval_configuration",
    sequelize: frontSequelize,
    hooks: {
      beforeValidate: (retrieval: AgentRetrievalConfiguration) => {
        // Validation for templated Query
        if (retrieval.query == "templated") {
          if (!retrieval.queryTemplate) {
            throw new Error("Must set a template for templated query");
          }
        } else if (retrieval.queryTemplate) {
          throw new Error("Can't set a template without templated query");
        }

        // Validation for Timeframe
        if (retrieval.relativeTimeFrame == "custom") {
          if (
            !retrieval.relativeTimeFrameDuration ||
            !retrieval.relativeTimeFrameUnit
          ) {
            throw new Error(
              "Custom relative time frame must have a duration and unit set"
            );
          }
        }

        // Validation for TopK
        if (retrieval.topKMode == "custom") {
          if (!retrieval.topK) {
            throw new Error("topK must be set when topKMode is 'custom'");
          }
        } else if (retrieval.topK) {
          throw new Error("topK must be null when topKMode is not 'custom'");
        }
      },
    },
  }
);

// DEPERECATED -- AgentConfig -> RetrievalConfig (1:1)
AgentRetrievalConfiguration.hasOne(AgentConfiguration, {
  as: "retrievalConfiguration",
  foreignKey: { name: "retrievalConfigurationId", allowNull: true }, // null = no retrieval action set for this Agent
});
AgentConfiguration.belongsTo(AgentRetrievalConfiguration, {
  as: "retrievalConfiguration",
  foreignKey: { name: "retrievalConfigurationId", allowNull: true }, // null = no retrieval action set for this Agent
});

// NEW -- AgentConfig -> RetrievalConfig (1:N)
AgentConfiguration.hasMany(AgentRetrievalConfiguration, {
  // TODO(@fontanierh) make it non-nullable
  foreignKey: { name: "agentConfigurationId", allowNull: true },
  onDelete: "CASCADE",
});
AgentRetrievalConfiguration.belongsTo(AgentConfiguration, {
  // TODO(@fontanierh) make it non-nullable
  foreignKey: { name: "agentConfigurationId", allowNull: true },
  onDelete: "CASCADE",
});

// TODO(@fontanierh) TO BE MOVED TO THE dust_app_run.ts file -- inlined during multi actions migration
// to avoid circular dependencies

export class AgentDustAppRunConfiguration extends Model<
  InferAttributes<AgentDustAppRunConfiguration>,
  InferCreationAttributes<AgentDustAppRunConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: ForeignKey<AgentConfiguration["id"] | null>;

  declare sId: string;

  declare appWorkspaceId: string;
  declare appId: string;
}

AgentDustAppRunConfiguration.init(
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
    appWorkspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    appId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "agent_dust_app_run_configuration",
    indexes: [
      {
        unique: true,
        fields: ["sId"],
      },
    ],
    sequelize: frontSequelize,
  }
);

// DEPERECATED -- AgentConfig -> DustAppRunConfig (1:1)
AgentDustAppRunConfiguration.hasOne(AgentConfiguration, {
  as: "dustAppRunConfiguration",
  foreignKey: { name: "dustAppRunConfigurationId", allowNull: true }, // null = no DustAppRun action set for this Agent
});
AgentConfiguration.belongsTo(AgentDustAppRunConfiguration, {
  as: "dustAppRunConfiguration",
  foreignKey: { name: "dustAppRunConfigurationId", allowNull: true }, // null = no DustAppRun action set for this Agent
});

// NEW -- AgentConfig -> DustAppRunConfig (1:N)
AgentConfiguration.hasMany(AgentDustAppRunConfiguration, {
  // TODO(@fontanierh): make it non-nullable
  foreignKey: { name: "agentConfigurationId", allowNull: true },
  onDelete: "CASCADE",
});
AgentDustAppRunConfiguration.belongsTo(AgentConfiguration, {
  // TODO(@fontanierh): make it non-nullable
  foreignKey: { name: "agentConfigurationId", allowNull: true },
  onDelete: "CASCADE",
});
