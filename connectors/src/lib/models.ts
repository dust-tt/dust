import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

const { CONNECTORS_DATABASE_URI } = process.env;

export const sequelize_conn = new Sequelize(CONNECTORS_DATABASE_URI as string, {});

export class SlackConfiguration extends Model<
  InferAttributes<SlackConfiguration>,
  InferCreationAttributes<SlackConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare slackTeamId: string;
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
    indexes: [{ fields: ['slackTeamId'] }],
    modelName: 'slack_configurations',
  }
);

export class Connector extends Model<InferAttributes<Connector>, InferCreationAttributes<Connector>> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare type: 'slack' | 'notion' | 'google';
  declare nangoConnectionId: string;
  declare dustAPIKey: string;
  declare dustWorkspaceId: string;
  declare dustDataSourceId: string;
  declare slackConfigurationId: ForeignKey<SlackConfiguration['id']>;
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
    dustAPIKey: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dustWorkspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dustDataSourceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: 'connectors',
  }
);

SlackConfiguration.hasOne(Connector);
