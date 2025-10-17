import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import type { MicrosoftNodeType } from "@connectors/connectors/microsoft/lib/types";
import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";

export class MicrosoftConfigurationModel extends ConnectorBaseModel<MicrosoftConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
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
    relationship: "hasOne",
  }
);

// MicrosoftRoot stores the drive/folders/channels selected by the user to sync.
// In order to be able to uniquely identify each node, we store the GET path
// to the item in the itemApiPath field (e.g. /drives/{drive-id}), except for the toplevel
// sites-root and teams-root, which are stored as "sites-root" and "teams-root" respectively.
export class MicrosoftRootModel extends ConnectorBaseModel<MicrosoftRootModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
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

// MicrosftNode stores nodes (e.g. files, folder, channels, ...) synced from Microsoft.
export class MicrosoftNodeModel extends ConnectorBaseModel<MicrosoftNodeModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastSeenTs: Date | null;
  declare lastUpsertedTs: Date | null;
  declare skipReason: string | null;
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
