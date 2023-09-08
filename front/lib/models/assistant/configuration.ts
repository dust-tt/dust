import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import { DataSource } from "@app/lib/models/data_source";
import { Workspace } from "@app/lib/models/workspace";
import { TimeframeUnit } from "@app/types/assistant/actions/retrieval";
import {
  AgentConfigurationScope,
  AgentConfigurationStatus,
} from "@app/types/assistant/configuration";

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
  declare status: AgentConfigurationStatus;
  declare name: string;
  declare pictureUrl: string | null;
  declare scope: AgentConfigurationScope;

  declare workspaceId: ForeignKey<Workspace["id"]> | null; // null = it's a global agent
  declare generationConfigId: ForeignKey<
    AgentGenerationConfiguration["id"]
  > | null;
  declare retrievalConfigId: ForeignKey<
    AgentRetrievalConfiguration["id"]
  > | null;
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
      unique: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "active",
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    pictureUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    scope: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "workspace",
    },
  },
  {
    modelName: "agent_configuration",
    sequelize: front_sequelize,
    indexes: [
      { fields: ["workspaceId"] },
      // Unique name per workspace.
      // Note that on PostgreSQL a unique constraint on multiple columns will treat NULL
      // as distinct from any other value, so we can create twice the same name if at least
      // one of the workspaceId is null. We're okay with it.
      { fields: ["workspaceId", "name", "scope"], unique: true },
      { fields: ["sId"], unique: true },
    ],
    hooks: {
      beforeValidate: (agent: AgentConfiguration) => {
        if (agent.scope !== "workspace" && agent.workspaceId) {
          throw new Error("Workspace id must be null for global agent");
        } else if (agent.scope === "workspace" && !agent.workspaceId) {
          throw new Error("Workspace id must be set for non-global agent");
        }
      },
    },
  }
);

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
  },
  {
    modelName: "agent_generation_configuration",
    sequelize: front_sequelize,
  }
);

/**
 * Action Retrieval configuration
 */
export class AgentRetrievalConfiguration extends Model<
  InferAttributes<AgentRetrievalConfiguration>,
  InferCreationAttributes<AgentRetrievalConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare query: "auto" | "none" | "templated";
  declare queryTemplate: string | null;
  declare relativeTimeFrame: "auto" | "none" | "custom";
  declare relativeTimeFrameDuration: number | null;
  declare relativeTimeFrameUnit: TimeframeUnit | null;
  declare topK: number;
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
      allowNull: false,
    },
  },
  {
    modelName: "agent_retrieval_configuration",
    sequelize: front_sequelize,
    hooks: {
      beforeValidate: (retrieval: AgentRetrievalConfiguration) => {
        // Validation for templated Query
        if (retrieval.query == "templated") {
          if (retrieval.queryTemplate === null) {
            throw new Error("Must set a template for templated query");
          }
        } else if (retrieval.queryTemplate !== null) {
          throw new Error("Can't set a template without templated query");
        }

        // Validation for Timeframe
        if (retrieval.relativeTimeFrame == "custom") {
          if (
            retrieval.relativeTimeFrameDuration === null ||
            retrieval.relativeTimeFrameUnit === null
          ) {
            throw new Error(
              "Custom relative time frame must have a duration and unit set"
            );
          }
        }
      },
    },
  }
);

/**
 * Configuration of Datasources used for Retrieval Action.
 */
export class AgentDataSourceConfiguration extends Model<
  InferAttributes<AgentDataSourceConfiguration>,
  InferCreationAttributes<AgentDataSourceConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare tagsIn: string[] | null;
  declare tagsNotIn: string[] | null;
  declare parentsIn: string[] | null;
  declare parentsNotIn: string[] | null;

  declare dataSourceId: ForeignKey<DataSource["id"]>;
  declare retrievalConfigId: ForeignKey<AgentRetrievalConfiguration["id"]>;
}
AgentDataSourceConfiguration.init(
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
    tagsIn: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    tagsNotIn: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    parentsIn: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    parentsNotIn: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
  },
  {
    modelName: "agent_data_source_configuration",
    sequelize: front_sequelize,
    hooks: {
      beforeValidate: (dataSourceConfig: AgentDataSourceConfiguration) => {
        if (
          (dataSourceConfig.tagsIn === null) !==
          (dataSourceConfig.tagsNotIn === null)
        ) {
          throw new Error("Tags must be both set or both null");
        }
        if (
          (dataSourceConfig.parentsIn === null) !==
          (dataSourceConfig.parentsNotIn === null)
        ) {
          throw new Error("Parents must be both set or both null");
        }
      },
    },
  }
);

//  Agent config <> Workspace
Workspace.hasMany(AgentConfiguration, {
  foreignKey: { name: "workspaceId", allowNull: true }, // null = global Agent
  onDelete: "CASCADE",
});

// Agent config <> Generation config
AgentGenerationConfiguration.hasOne(AgentConfiguration, {
  foreignKey: { name: "generationConfigId", allowNull: true }, // null = no generation set for this Agent
});
// Agent config <> Retrieval config
AgentRetrievalConfiguration.hasOne(AgentConfiguration, {
  foreignKey: { name: "retrievalConfigId", allowNull: true }, // null = no retrieval action set for this Agent
});

// Retrieval config <> Data source config
AgentRetrievalConfiguration.hasOne(AgentDataSourceConfiguration, {
  foreignKey: { name: "retrievalConfigId", allowNull: false },
  onDelete: "CASCADE",
});

// Data source config <> Data source
DataSource.hasMany(AgentDataSourceConfiguration, {
  foreignKey: { name: "dataSourceId", allowNull: false },
  onDelete: "CASCADE",
});
