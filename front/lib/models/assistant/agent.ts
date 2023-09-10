import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import { AgentRetrievalConfiguration } from "@app/lib/models/assistant/actions/retrieval";
import { Workspace } from "@app/lib/models/workspace";
import {
  AgentConfigurationScope,
  AgentConfigurationStatus,
} from "@app/types/assistant/agent";

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
  declare generationConfigurationId: ForeignKey<
    AgentGenerationConfiguration["id"]
  > | null;
  declare retrievalConfigurationId: ForeignKey<
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

//  Agent config <> Workspace
Workspace.hasMany(AgentConfiguration, {
  foreignKey: { name: "workspaceId", allowNull: true }, // null = global Agent
  onDelete: "CASCADE",
});

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

// Agent config <> Generation config
AgentGenerationConfiguration.hasOne(AgentConfiguration, {
  foreignKey: { name: "generationConfigurationId", allowNull: true }, // null = no generation set for this Agent
});
