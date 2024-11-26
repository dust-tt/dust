import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

function throwOnUnsafeInteger(value: number | null) {
  if (value !== null && !Number.isSafeInteger(value)) {
    throw new Error(`Value must be a safe integer: ${value}`);
  }
}

export class ZendeskTimestampCursor extends Model<
  InferAttributes<ZendeskTimestampCursor>,
  InferCreationAttributes<ZendeskTimestampCursor>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // start date of the last successful sync
  declare timestampCursor: Date;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}

ZendeskTimestampCursor.init(
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

export class ZendeskConfiguration extends Model<
  InferAttributes<ZendeskConfiguration>,
  InferCreationAttributes<ZendeskConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare subdomain: string;
  declare retentionPeriodDays: number;

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}

ZendeskConfiguration.init(
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

export class ZendeskBrand extends Model<
  InferAttributes<ZendeskBrand>,
  InferCreationAttributes<ZendeskBrand>
> {
  declare id: CreationOptional<number>;
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
      { fields: ["connectorId"] },
      {
        fields: ["connectorId", "brandId"],
        unique: true,
        name: "zendesk_connector_brand_idx",
      },
      { fields: ["brandId"] },
    ],
  }
);
ConnectorModel.hasMany(ZendeskBrand, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});

export class ZendeskCategory extends Model<
  InferAttributes<ZendeskCategory>,
  InferCreationAttributes<ZendeskCategory>
> {
  declare id: CreationOptional<number>;
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
        fields: ["connectorId", "categoryId"],
        unique: true,
        name: "zendesk_connector_category_idx",
      },
      { fields: ["categoryId"] },
      { fields: ["connectorId"] },
    ],
  }
);
ConnectorModel.hasMany(ZendeskCategory, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});

export class ZendeskArticle extends Model<
  InferAttributes<ZendeskArticle>,
  InferCreationAttributes<ZendeskArticle>
> {
  declare id: CreationOptional<number>;
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
        fields: ["connectorId", "articleId"],
        unique: true,
        name: "zendesk_connector_article_idx",
      },
      { fields: ["articleId"] },
      { fields: ["connectorId"] },
    ],
  }
);
ConnectorModel.hasMany(ZendeskArticle, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});

export class ZendeskTicket extends Model<
  InferAttributes<ZendeskTicket>,
  InferCreationAttributes<ZendeskTicket>
> {
  declare id: CreationOptional<number>;
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
        fields: ["connectorId", "ticketId"],
        unique: true,
        name: "zendesk_connector_ticket_idx",
      },
      { fields: ["ticketId"] },
      { fields: ["connectorId"] },
    ],
  }
);

ConnectorModel.hasMany(ZendeskTicket, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
