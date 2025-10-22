import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { connectorsSequelize } from "@connectors/resources/storage";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";

export class GongConfigurationModel extends ConnectorBaseModel<GongConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare lastSyncTimestamp: number | null;
  declare lastGarbageCollectionTimestamp: number | null;
  declare baseUrl: string;
  declare retentionPeriodDays: number | null;
  declare trackersEnabled: boolean;
  declare accountsEnabled: boolean;
}

GongConfigurationModel.init(
  {
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
    lastSyncTimestamp: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    lastGarbageCollectionTimestamp: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    baseUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    retentionPeriodDays: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    trackersEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    accountsEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize: connectorsSequelize,
    modelName: "gong_configurations",
    indexes: [{ fields: ["connectorId"], unique: true }],
    relationship: "hasOne",
  }
);

export class GongUserModel extends ConnectorBaseModel<GongUserModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Gong user properties.
  declare email: string;
  declare firstName: string | null;
  declare gongId: string;
  declare lastName: string | null;
}

GongUserModel.init(
  {
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
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    gongId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    indexes: [{ fields: ["connectorId", "gongId"], unique: true }],
    modelName: "gong_users",
    relationship: "hasMany",
    sequelize: connectorsSequelize,
  }
);

export class GongTranscriptModel extends ConnectorBaseModel<GongTranscriptModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare callDate: number;
  declare callId: string;
  declare title: string;
  declare url: string;
}

GongTranscriptModel.init(
  {
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
    callDate: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    callId: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    title: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    sequelize: connectorsSequelize,
    modelName: "gong_transcripts",
    indexes: [{ fields: ["connectorId", "callId"], unique: true }],
  }
);
