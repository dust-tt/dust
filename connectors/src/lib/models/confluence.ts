import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";

export class ConfluenceConfiguration extends ConnectorBaseModel<ConfluenceConfiguration> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare cloudId: string;
  declare url: string;
  declare userAccountId: string;
}
ConfluenceConfiguration.init(
  {
    cloudId: {
      type: DataTypes.STRING,
      allowNull: false,
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
    userAccountId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "confluence_configurations",
    indexes: [
      { fields: ["connectorId"], unique: true },
      { fields: ["userAccountId"] },
    ],
    relationship: "hasOne",
  }
);

// ConfluenceSpace stores the global spaces selected by the user to sync.
export class ConfluenceSpace extends ConnectorBaseModel<ConfluenceSpace> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: Date | null;

  declare name: string;
  declare spaceId: string;
  declare urlSuffix?: string;
}
ConfluenceSpace.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    spaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    urlSuffix: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "confluence_spaces",
    indexes: [{ fields: ["connectorId", "spaceId"], unique: true }],
  }
);

// ConfluencePages stores the pages.
export class ConfluencePage extends ConnectorBaseModel<ConfluencePage> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastVisitedAt: CreationOptional<Date>;

  declare externalUrl: string;
  declare pageId: string;
  declare parentId: string | null;
  declare parentType: "page" | "folder" | null;
  declare skipReason: string | null;
  declare spaceId: string;
  declare title: string;
  declare version: number;
}
ConfluencePage.init(
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
    lastVisitedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    skipReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    parentId: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    parentType: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    pageId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    spaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    title: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    externalUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    indexes: [
      { fields: ["connectorId", "pageId"], unique: true },
      { fields: ["connectorId", "spaceId", "parentId"] },
      { fields: ["connectorId", "lastVisitedAt"] },
    ],
    modelName: "confluence_pages",
  }
);

export class ConfluenceFolder extends ConnectorBaseModel<ConfluenceFolder> {
  declare createdAt: CreationOptional<Date>;
  declare lastVisitedAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare externalUrl: string;
  declare folderId: string;
  declare parentId: string | null;
  declare parentType: "page" | "folder" | null;
  declare skipReason: string | null;
  declare spaceId: string;
  declare title: string;
  declare version: number;
}

ConfluenceFolder.init(
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
    lastVisitedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    skipReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    parentId: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    parentType: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    folderId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    spaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    title: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    externalUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    indexes: [
      { fields: ["connectorId", "folderId"], unique: true },
      { fields: ["connectorId", "spaceId", "parentId"] },
      { fields: ["connectorId", "lastVisitedAt"] },
    ],
    modelName: "confluence_folders",
  }
);
