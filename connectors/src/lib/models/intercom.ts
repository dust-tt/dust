import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";

import { Connector, sequelize_conn } from "@connectors/lib/models";

export class IntercomConnectorState extends Model<
  InferAttributes<IntercomConnectorState>,
  InferCreationAttributes<IntercomConnectorState>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare lastGarbageCollectionFinishTime?: Date;

  declare connectorId: ForeignKey<Connector["id"]>;
}

IntercomConnectorState.init(
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
    lastGarbageCollectionFinishTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: sequelize_conn,
    modelName: "intercom_connector_states",
    indexes: [{ fields: ["connectorId"], unique: true }],
  }
);

Connector.hasOne(IntercomConnectorState);

export class IntercomCollection extends Model<
  InferAttributes<IntercomCollection>,
  InferCreationAttributes<IntercomCollection>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare workspaceId: string;
  declare collectionId: string;

  declare helpCenterId: string | null;
  declare parentId: string | null;

  declare name: string;
  declare description: string | null;

  declare connectorId: ForeignKey<Connector["id"]>;
}

IntercomCollection.init(
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
    workspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    collectionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    helpCenterId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    parentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize: sequelize_conn,
    indexes: [
      { fields: ["workspaceId", "collectionId", "connectorId"], unique: true },
      { fields: ["connectorId"] },
      { fields: ["collectionId"] },
    ],
    modelName: "intercom_collections",
  }
);
Connector.hasMany(IntercomCollection);

export class IntercomArticle extends Model<
  InferAttributes<IntercomArticle>,
  InferCreationAttributes<IntercomArticle>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare workspaceId: string;
  declare articleId: string;
  declare authorId: string;

  declare parentId: string | null;
  declare parentType: "collection" | null;

  declare state: "draft" | "published";

  declare connectorId: ForeignKey<Connector["id"]>;
}

IntercomArticle.init(
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
    workspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    articleId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    authorId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    parentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    parentType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    indexes: [
      { fields: ["workspaceId", "articleId", "connectorId"], unique: true },
      { fields: ["connectorId"] },
      { fields: ["articleId"] },
    ],
    modelName: "intercom_articles",
  }
);
Connector.hasMany(IntercomArticle);
