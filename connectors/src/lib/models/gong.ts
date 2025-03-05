import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";

export class GongConfigurationModel extends ConnectorBaseModel<GongConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare lastSyncTimestamp: number | null;
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
  },
  {
    sequelize: sequelizeConnection,
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
    sequelize: sequelizeConnection,
  }
);
