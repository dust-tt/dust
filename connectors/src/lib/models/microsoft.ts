import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import type { MicrosoftNodeType } from "@connectors/connectors/microsoft/lib/types";
import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import { BaseModel } from "@connectors/resources/storage/wrappers";

export class MicrosoftConfigurationModel extends BaseModel<MicrosoftConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
  declare pdfEnabled: boolean;
  declare csvEnabled: boolean;
  declare largeFilesEnabled: boolean;
}
MicrosoftConfigurationModel.init(
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
    connectorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    pdfEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    csvEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    largeFilesEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "microsoft_configurations",
    indexes: [{ fields: ["connectorId"], unique: true }],
  }
);

ConnectorModel.hasMany(MicrosoftConfigurationModel);

// MicrosoftRoot stores the drive/folders/channels selected by the user to sync.
// In order to be able to uniquely identify each node, we store the GET path
// to the item in the itemApiPath field (e.g. /drives/{drive-id}), except for the toplevel
// sites-root and teams-root, which are stored as "sites-root" and "teams-root" respectively.
export class MicrosoftRootModel extends BaseModel<MicrosoftRootModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
  declare internalId: string;
  declare nodeType: MicrosoftNodeType;
}
MicrosoftRootModel.init(
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
    connectorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    internalId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    nodeType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "microsoft_roots",
    indexes: [
      { fields: ["connectorId", "internalId"], unique: true },
      { fields: ["connectorId", "nodeType"], unique: false },
    ],
  }
);
ConnectorModel.hasMany(MicrosoftRootModel);

// MicrosftNode stores nodes (e.g. files, folder, channels, ...) synced from Microsoft.
export class MicrosoftNodeModel extends BaseModel<MicrosoftNodeModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastSeenTs: Date | null;
  declare lastUpsertedTs: Date | null;
  declare skipReason: string | null;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
  declare internalId: string;
  declare nodeType: MicrosoftNodeType;
  declare name: string | null;
  declare mimeType: string | null;
  declare parentInternalId: string | null;
  declare deltaLink: string | null;
  declare webUrl: string | null;
}

MicrosoftNodeModel.init(
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
    lastSeenTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastUpsertedTs: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    skipReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    connectorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    internalId: {
      type: DataTypes.STRING(512),
      allowNull: false,
    },
    nodeType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    mimeType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    parentInternalId: {
      type: DataTypes.STRING(512),
      allowNull: true,
    },
    deltaLink: {
      type: DataTypes.STRING(1024),
      allowNull: true,
    },
    webUrl: {
      type: DataTypes.STRING(1024),
      allowNull: true,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "microsoft_nodes",
    indexes: [
      { fields: ["internalId", "connectorId"], unique: true },
      { fields: ["connectorId", "nodeType"], unique: false },
      { fields: ["parentInternalId", "connectorId"], concurrently: true },
    ],
  }
);
ConnectorModel.hasMany(MicrosoftNodeModel);
