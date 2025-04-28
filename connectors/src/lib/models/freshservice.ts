import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";

export class FreshServiceConfigurationModel extends ConnectorBaseModel<FreshServiceConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare subdomain: string;
  declare retentionPeriodDays: number;
  declare ticketPermission: "read" | "none";
}

FreshServiceConfigurationModel.init(
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
    subdomain: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    retentionPeriodDays: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 180,
    },
    ticketPermission: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "none",
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "freshservice_configurations",
    indexes: [{ fields: ["connectorId"], unique: true }],
    relationship: "hasOne",
  }
);

export class FreshServiceTimestampCursorModel extends ConnectorBaseModel<FreshServiceTimestampCursorModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // start date of the last successful sync
  declare timestampCursor: Date;
}

FreshServiceTimestampCursorModel.init(
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
    timestampCursor: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "freshservice_timestamp_cursors",
    indexes: [{ fields: ["connectorId"], unique: true }],
  }
);

export class FreshServiceTicketModel extends ConnectorBaseModel<FreshServiceTicketModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare ticketId: number;

  declare subject: string | null;
  declare url: string;

  declare ticketUpdatedAt: Date;
  declare lastUpsertedTs: Date | null;
}

FreshServiceTicketModel.init(
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
    ticketId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    subject: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    ticketUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    lastUpsertedTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "freshservice_tickets",
    indexes: [
      {
        fields: ["connectorId", "ticketId"],
        unique: true,
        name: "freshservice_tickets_connector_ticket_idx",
      },
      { fields: ["connectorId"] },
    ],
  }
);
