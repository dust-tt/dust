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

  declare brandId: string;
  declare permission: "read" | "none";

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
      type: DataTypes.STRING,
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
    permission: {
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
ConnectorModel.hasMany(ZendeskBrand);

export class ZendeskCategory extends Model<
  InferAttributes<ZendeskCategory>,
  InferCreationAttributes<ZendeskCategory>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare categoryId: string;
  declare brandId: string;
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
      type: DataTypes.STRING,
      allowNull: false,
    },
    brandId: {
      type: DataTypes.STRING,
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
ConnectorModel.hasMany(ZendeskCategory);

export class ZendeskArticle extends Model<
  InferAttributes<ZendeskArticle>,
  InferCreationAttributes<ZendeskArticle>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare articleId: string;
  declare brandId: string;
  declare categoryId: string;
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
      type: DataTypes.STRING,
      allowNull: false,
    },
    brandId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    categoryId: {
      type: DataTypes.STRING,
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
ConnectorModel.hasMany(ZendeskCategory);
