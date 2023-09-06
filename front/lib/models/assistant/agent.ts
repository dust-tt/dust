import {
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import { Workspace } from "@app/lib/models/workspace";
import { AgentConfigurationStatus } from "@app/types/assistant/agent";

import { AssistantAgentRetrievalConfiguration } from "./actions/retrieval";

/**
 * Agent configuration
 */
export class AssistantAgentConfiguration extends Model<
  InferAttributes<AssistantAgentConfiguration>,
  InferCreationAttributes<AssistantAgentConfiguration>
> {
  declare id: number;

  declare sId: string;
  declare status: AgentConfigurationStatus;
  declare name: string;
  declare pictureUrl: string | null;

  declare isGlobal: boolean;
  declare workspaceId: ForeignKey<Workspace["id"]> | null; // null = it's a global agent

  declare model: ForeignKey<AssistantAgentRetrievalConfiguration["id"]> | null;
}
AssistantAgentConfiguration.init(
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
    isGlobal: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    modelName: "assistant_agent_configuration",
    sequelize: front_sequelize,
    indexes: [
      { fields: ["workspaceId"] },
      // Unique name per workspace.
      // Note that on PostgreSQL a unique constraint on multiple columns will treat NULL
      // as distinct from any other value, so we can create twice the same name if at least
      // one of the workspaceId is null. We're okay with it.
      { fields: ["workspaceId", "name", "isGlobal"], unique: true },
      { fields: ["sId"], unique: true },
    ],
    hooks: {
      beforeValidate: (agent: AssistantAgentConfiguration) => {
        if (agent.isGlobal && agent.workspaceId) {
          throw new Error("Workspace id must be null for global agent");
        }
        if (!agent.isGlobal && !agent.workspaceId) {
          throw new Error("Workspace id must be set for non-global agent");
        }
      },
    },
  }
);

/**
 * Configuration of Agent generation.
 */
export class AssistantAgentGenerationConfiguration extends Model<
  InferAttributes<AssistantAgentGenerationConfiguration>,
  InferCreationAttributes<AssistantAgentGenerationConfiguration>
> {
  declare id: number;

  declare prompt: string;
  declare modelProvider: string;
  declare modelId: string;

  declare agentId: ForeignKey<AssistantAgentConfiguration["id"]>;
}
AssistantAgentGenerationConfiguration.init(
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
    modelName: "assistant_agent_generation_configuration",
    sequelize: front_sequelize,
  }
);

// Workspace <> Agent config
Workspace.hasMany(AssistantAgentConfiguration, {
  foreignKey: { name: "workspaceId", allowNull: true }, // null = global Agent
  onDelete: "CASCADE",
});

// Agent config <> Generation config
AssistantAgentConfiguration.hasOne(AssistantAgentGenerationConfiguration, {
  foreignKey: { name: "agentId", allowNull: false }, // null = no retrieval action set for this Agent
  onDelete: "CASCADE",
});
