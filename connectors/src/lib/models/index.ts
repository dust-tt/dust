import type {
  ConnectorErrorType,
  ConnectorProvider,
  ConnectorSyncStatus,
} from "@dust-tt/types";
import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";

export class Connector extends Model<
  InferAttributes<Connector>,
  InferCreationAttributes<Connector>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare type: ConnectorProvider;
  declare connectionId: string;

  declare workspaceAPIKey: string;
  declare workspaceId: string;
  declare dataSourceName: string;

  declare lastSyncStatus?: ConnectorSyncStatus;
  declare errorType: ConnectorErrorType | null;
  declare lastSyncStartTime?: Date;
  declare lastSyncFinishTime?: Date;
  declare lastSyncSuccessfulTime?: Date | null;
  declare firstSuccessfulSyncTime?: Date;
  declare firstSyncProgress?: string;
  declare lastGCTime: Date | null;
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
    connectionId: {
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
    lastSyncStatus: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    errorType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lastSyncStartTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastSyncFinishTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastSyncSuccessfulTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    firstSuccessfulSyncTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    firstSyncProgress: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lastGCTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "connectors",
    indexes: [{ fields: ["workspaceId", "dataSourceName"], unique: true }],
  }
);
