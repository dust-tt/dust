import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import { BaseModel } from "@connectors/resources/storage/wrappers";

function throwOnUnsafeInteger(value: number | null) {
  if (value !== null && !Number.isSafeInteger(value)) {
    throw new Error(`Value must be a safe integer: ${value}`);
  }
}

export class ZendeskTimestampCursor extends BaseModel<ZendeskTimestampCursor> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // start date of the last successful sync
  declare timestampCursor: Date;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}

ZendeskTimestampCursor.init(
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
    modelName: "zendesk_timestamp_cursors",
    indexes: [{ fields: ["connectorId"], unique: true }],
  }
);
ConnectorModel.hasMany(ZendeskTimestampCursor, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
ZendeskTimestampCursor.belongsTo(ConnectorModel);

export class ZendeskConfiguration extends BaseModel<ZendeskConfiguration> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare subdomain: string;
  declare retentionPeriodDays: number;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}

ZendeskConfiguration.init(
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
      defaultValue: 180, // approximately 6 months
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "zendesk_configurations",
    indexes: [{ fields: ["connectorId"], unique: true }],
  }
);
ConnectorModel.hasMany(ZendeskConfiguration, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
ZendeskConfiguration.belongsTo(ConnectorModel);

export class ZendeskBrand extends BaseModel<ZendeskBrand> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare brandId: number;
  declare helpCenterPermission: "read" | "none";
  declare ticketsPermission: "read" | "none";

  declare name: string;
  declare url: string;
  declare subdomain: string;
  declare hasHelpCenter: boolean;

  declare lastUpsertedTs?: Date;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}

ZendeskBrand.init(
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
    brandId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      validate: { throwOnUnsafeInteger },
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    subdomain: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    helpCenterPermission: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    ticketsPermission: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    hasHelpCenter: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    lastUpsertedTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "zendesk_brands",
    indexes: [
      {
        fields: ["connectorId", "brandId"],
        unique: true,
        name: "zendesk_brands_connector_brand_idx",
      },
      { fields: ["connectorId"] },
    ],
  }
);
ConnectorModel.hasMany(ZendeskBrand, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});

export class ZendeskCategory extends BaseModel<ZendeskCategory> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare categoryId: number;
  declare brandId: number;
  declare permission: "read" | "none";

  declare name: string;
  declare description: string | null;
  declare url: string;

  declare lastUpsertedTs?: Date;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}

ZendeskCategory.init(
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
    categoryId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      validate: { throwOnUnsafeInteger },
    },
    brandId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      validate: { throwOnUnsafeInteger },
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    permission: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastUpsertedTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "zendesk_categories",
    indexes: [
      {
        fields: ["connectorId", "brandId", "categoryId"],
        unique: true,
        name: "zendesk_categories_connector_brand_category_idx",
      },
      {
        fields: ["connectorId", "brandId"],
        name: "zendesk_categories_connector_brand_idx",
      },
      { fields: ["connectorId"] },
    ],
  }
);
ConnectorModel.hasMany(ZendeskCategory, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});

export class ZendeskArticle extends BaseModel<ZendeskArticle> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare articleId: number;
  declare brandId: number;
  declare categoryId: number;
  declare permission: "read" | "none";

  declare name: string;
  declare url: string;

  declare lastUpsertedTs: Date | null;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}

ZendeskArticle.init(
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
    articleId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      validate: { throwOnUnsafeInteger },
    },
    brandId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      validate: { throwOnUnsafeInteger },
    },
    categoryId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      validate: { throwOnUnsafeInteger },
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    permission: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastUpsertedTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "zendesk_articles",
    indexes: [
      {
        fields: ["connectorId", "brandId", "articleId"],
        unique: true,
        name: "zendesk_articles_connector_brand_article_idx",
      },
      {
        fields: ["connectorId", "brandId", "categoryId"],
        name: "zendesk_articles_connector_brand_category_idx",
      },
      {
        fields: ["connectorId", "brandId"],
        name: "zendesk_articles_connector_brand_idx",
      },
      { fields: ["connectorId"] },
    ],
  }
);
ConnectorModel.hasMany(ZendeskArticle, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});

export class ZendeskTicket extends BaseModel<ZendeskTicket> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare ticketId: number;
  declare brandId: number;
  declare permission: "read" | "none";

  declare subject: string;
  declare url: string;

  declare ticketUpdatedAt: Date;
  declare lastUpsertedTs: Date;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}

ZendeskTicket.init(
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
    url: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    subject: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    ticketId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      validate: { throwOnUnsafeInteger },
    },
    brandId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      validate: { throwOnUnsafeInteger },
    },
    permission: {
      type: DataTypes.STRING,
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
    modelName: "zendesk_tickets",
    indexes: [
      {
        fields: ["connectorId", "brandId", "ticketId"],
        unique: true,
        name: "zendesk_tickets_connector_brand_ticket_idx",
      },
      {
        fields: ["connectorId", "brandId"],
        name: "zendesk_tickets_connector_brand_idx",
      },
      { fields: ["connectorId"] },
    ],
  }
);

ConnectorModel.hasMany(ZendeskTicket, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
