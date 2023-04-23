import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

const { CONNECTORS_DATABASE_URI } = process.env;

export const sequelize_conn = new Sequelize(
  CONNECTORS_DATABASE_URI as string,
  {}
);

export class Connector extends Model<
  InferAttributes<Connector>,
  InferCreationAttributes<Connector>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare type: "slack" | "notion" | "google";
  declare nangoConnectionId: string;
  declare workspaceAPIKey: string;
  declare workspaceId: string;
  declare dataSourceName: string;
}

Connector.init(
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
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    nangoConnectionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    workspaceAPIKey: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    workspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dataSourceName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "connectors",
  }
);

export class SlackConfiguration extends Model<
  InferAttributes<SlackConfiguration>,
  InferCreationAttributes<SlackConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare slackTeamId: string;
  declare connectorId: ForeignKey<Connector["id"]>;
}

SlackConfiguration.init(
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
    slackTeamId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    indexes: [{ fields: ["slackTeamId"] }, { fields: ["connectorId"] , unique: true}],
    modelName: "slack_configurations",
  }
);
Connector.hasOne(SlackConfiguration);
