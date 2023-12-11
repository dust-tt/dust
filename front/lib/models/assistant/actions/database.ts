import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";

import { front_sequelize } from "@app/lib/databases";

/**
 * Action Database Configuration
 */
export class AgentDatabaseConfiguration extends Model<
  InferAttributes<AgentDatabaseConfiguration>,
  InferCreationAttributes<AgentDatabaseConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;

  declare dataSourceId: string;
  declare databaseId: string;
}

AgentDatabaseConfiguration.init(
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
    modelName: "agent_database_configuration",
    indexes: [
      {
        unique: true,
        fields: ["sId"],
      },
    ],
    sequelize: front_sequelize,
  }
);
