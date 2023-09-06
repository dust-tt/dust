import {
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
  declare id: number;

  declare sId: string;
  declare status: AgentConfigurationStatus;
  declare name: string;
  declare pictureUrl: string | null;

  declare scope: AgentConfigurationScope;
  declare workspaceId: ForeignKey<Workspace["id"]> | null; // null = it's a global agent

  declare model: ForeignKey<AgentRetrievalConfiguration["id"]> | null;
}
AgentConfiguration.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
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
  declare id: number;

  declare prompt: string;
  declare modelProvider: string;
  declare modelId: string;

  declare agentId: ForeignKey<AgentConfiguration["id"]>;
}
AgentGenerationConfiguration.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    prompt: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    modelProvider: {
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

// Workspace <> Agent config
Workspace.hasMany(AgentConfiguration, {
  foreignKey: { name: "workspaceId", allowNull: true }, // null = global Agent
  onDelete: "CASCADE",
});

// Agent config <> Generation config
AgentConfiguration.hasOne(AgentGenerationConfiguration, {
  foreignKey: { name: "agentId", allowNull: false }, // null = no retrieval action set for this Agent
  onDelete: "CASCADE",
});
