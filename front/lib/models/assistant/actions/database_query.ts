import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";

import { front_sequelize } from "@app/lib/databases";

/**
 * Agent Database Query Configuration
 */
export class AgentDatabaseQueryConfiguration extends Model<
  InferAttributes<AgentDatabaseQueryConfiguration>,
  InferCreationAttributes<AgentDatabaseQueryConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;

  declare dataSourceWorkspaceId: string;
  declare dataSourceId: string;
  declare databaseId: string;
}

AgentDatabaseQueryConfiguration.init(
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
    dataSourceWorkspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dataSourceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    databaseId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "agent_database_query_configuration",
    indexes: [
      {
        unique: true,
        fields: ["sId"],
      },
    ],
    sequelize: front_sequelize,
  }
);

/**
 * Agent Database Query Action
 */
export class AgentDatabaseQueryAction extends Model<
  InferAttributes<AgentDatabaseQueryAction>,
  InferCreationAttributes<AgentDatabaseQueryAction>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare databaseQueryConfigurationId: string;

  declare dataSourceWorkspaceId: string;
  declare dataSourceId: string;
  declare databaseId: string;

  declare params: unknown | null;
  declare output: unknown | null;
}

AgentDatabaseQueryAction.init(
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
    databaseQueryConfigurationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dataSourceWorkspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dataSourceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    databaseId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    params: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    output: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    modelName: "agent_database_query_action",
    sequelize: front_sequelize,
  }
);
