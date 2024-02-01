import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { Connector, sequelize_conn } from "@connectors/lib/models";

export class IntercomHelpCenter extends Model<
  InferAttributes<IntercomHelpCenter>,
  InferCreationAttributes<IntercomHelpCenter>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare intercomWorkspaceId: string;
  declare helpCenterId: string;

  declare name: string;
  declare identifier: string;

  declare lastUpsertedTs?: Date;
  declare permission: "read" | "none";

  declare connectorId: ForeignKey<Connector["id"]>;
}
IntercomHelpCenter.init(
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
    intercomWorkspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    helpCenterId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    identifier: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastUpsertedTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    permission: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    indexes: [
      {
        fields: ["connectorId", "helpCenterId"],
        unique: true,
        name: "intercom_connector_help_center_idx",
      },
      { fields: ["connectorId"] },
      { fields: ["helpCenterId"] },
    ],
    modelName: "intercom_help_centers",
  }
);
Connector.hasMany(IntercomHelpCenter);

export class IntercomCollection extends Model<
  InferAttributes<IntercomCollection>,
  InferCreationAttributes<IntercomCollection>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare intercomWorkspaceId: string;
  declare collectionId: string;

  declare helpCenterId: string;
  declare parentId: string | null;

  declare name: string;
  declare description: string | null;
  declare url: string;

  declare lastUpsertedTs?: Date;
  declare permission: "read" | "none";

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
    intercomWorkspaceId: {
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
    url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastUpsertedTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    permission: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    indexes: [
      {
        fields: ["connectorId", "collectionId"],
        unique: true,
        name: "intercom_connector_collection_idx",
      },
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

  declare intercomWorkspaceId: string;
  declare articleId: string;
  declare authorId: string;
  declare title: string;
  declare url: string;

  declare parentId: string | null;
  declare parentType: "collection" | null;
  declare parents: string[];

  declare state: "draft" | "published";

  declare lastUpsertedTs?: Date;
  declare permission: "read" | "none";

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
    intercomWorkspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    articleId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING,
      allowNull: true,
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
    parents: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
    },
    state: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastUpsertedTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    permission: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    indexes: [
      {
        fields: ["connectorId", "articleId"],
        unique: true,
        name: "intercom_connector_article_idx",
      },
      { fields: ["connectorId"] },
      { fields: ["articleId"] },
    ],
    modelName: "intercom_articles",
  }
);
Connector.hasMany(IntercomArticle);

export class IntercomTeam extends Model<
  InferAttributes<IntercomTeam>,
  InferCreationAttributes<IntercomTeam>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare teamId: string;
  declare name: string;

  declare lastUpsertedTs?: Date;
  declare permission: "read" | "none";

  declare connectorId: ForeignKey<Connector["id"]>;
}

IntercomTeam.init(
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
    teamId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastUpsertedTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    permission: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelize_conn,
    indexes: [
      {
        fields: ["connectorId", "teamId"],
        unique: true,
        name: "intercom_connector_team_idx",
      },
    ],
    modelName: "intercom_teams",
  }
);
Connector.hasMany(IntercomTeam);
