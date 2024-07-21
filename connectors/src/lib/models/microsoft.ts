import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import type { MicrosoftNodeType } from "@connectors/connectors/microsoft/lib/types";
import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

export class MicrosoftConfigurationModel extends Model<
  InferAttributes<MicrosoftConfigurationModel>,
  InferCreationAttributes<MicrosoftConfigurationModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
  declare pdfEnabled: boolean;
  declare largeFilesEnabled: boolean;
}
MicrosoftConfigurationModel.init(
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
    connectorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    pdfEnabled: {
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
export class MicrosoftRootModel extends Model<
  InferAttributes<MicrosoftRootModel>,
  InferCreationAttributes<MicrosoftRootModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
  declare internalId: string;
  declare nodeType: MicrosoftNodeType;
  declare currentDeltaLink: string;
}
MicrosoftRootModel.init(
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
    currentDeltaLink: {
      type: DataTypes.STRING(1024),
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
export class MicrosoftNodeModel extends Model<
  InferAttributes<MicrosoftNodeModel>,
  InferCreationAttributes<MicrosoftNodeModel>
> {
  declare id: CreationOptional<number>;
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
}

MicrosoftNodeModel.init(
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
