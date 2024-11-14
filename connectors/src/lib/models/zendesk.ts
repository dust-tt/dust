import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

export class ZendeskTimestampCursors extends Model<
  InferAttributes<ZendeskTimestampCursors>,
  InferCreationAttributes<ZendeskTimestampCursors>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare timestampCursor: Date | null; // start date of the last successful sync, null if never successfully synced

  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}

ZendeskTimestampCursors.init(
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
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "zendesk_timestamp_cursors",
    indexes: [{ fields: ["connectorId"], unique: true }],
  }
);
ConnectorModel.hasMany(ZendeskTimestampCursors, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
ZendeskTimestampCursors.belongsTo(ConnectorModel);

export class ZendeskConfiguration extends Model<
  InferAttributes<ZendeskConfiguration>,
  InferCreationAttributes<ZendeskConfiguration>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare subdomain: string;
  declare conversationsSlidingWindow: number;

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
    conversationsSlidingWindow: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 90,
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
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING,
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
    },
    brandId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    url: {
      type: DataTypes.STRING,
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
    },
    brandId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    categoryId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING,
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

  declare assigneeId: number;
  declare groupId: number;
  declare organizationId: number;

  declare subject: string;
  declare url: string;

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
      type: DataTypes.STRING,
      allowNull: false,
    },
    subject: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    ticketId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    brandId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    groupId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    assigneeId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    organizationId: {
      type: DataTypes.BIGINT,
      allowNull: true,
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
