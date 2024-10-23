import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

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
      type: DataTypes.INTEGER,
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
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    brandId: {
      type: DataTypes.INTEGER,
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

  declare lastUpsertedTs: Date;

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
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    brandId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    categoryId: {
      type: DataTypes.INTEGER,
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

  declare name: string;
  declare description: string;
  declare subject: string;
  declare requesterMail: string;
  declare url: string;

  declare satisfactionScore: string;
  declare satisfactionComment: string;

  declare status: "new" | "open" | "pending" | "hold" | "solved" | "closed";
  declare tags: string[];
  declare type: "problem" | "incident" | "question" | "task";
  declare customFields: string[];

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
    ticketId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    brandId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    groupId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    assigneeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    organizationId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    satisfactionScore: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    satisfactionComment: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    requesterMail: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    customFields: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
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
