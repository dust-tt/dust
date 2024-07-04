import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import type { MicrosoftNodeType } from "@connectors/connectors/microsoft/lib/node_types";
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
  declare itemApiPath: string;
  declare nodeType: MicrosoftNodeType;
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
    itemApiPath: {
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
      { fields: ["connectorId", "itemApiPath"], unique: true },
      { fields: ["connectorId", "nodeType"], unique: false },
    ],
  }
);
ConnectorModel.hasMany(MicrosoftRootModel);

// MicrosftNode stores files/folders/channels and other nodes synced from Microsoft.
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
  declare name: string;
  declare mimeType: string;
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
      allowNull: false,
      defaultValue: "",
    },
    mimeType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "",
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
      { fields: ["connectorId", "internalId"], unique: true },
      { fields: ["connectorId", "nodeType"], unique: false },
      { fields: ["connectorId", "parentInternalId"], concurrently: true },
    ],
  }
);
ConnectorModel.hasMany(MicrosoftNodeModel);

// Delta token are used for creating a diff from the last calls.
// On every delta call, we store the new delta token to be used in the next call
// For each configured root node, we store a delta token.
export class MicrosoftDeltaModel extends Model<
  InferAttributes<MicrosoftDeltaModel>,
  InferCreationAttributes<MicrosoftDeltaModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare rootId: ForeignKey<MicrosoftRootModel["itemApiPath"]>;
  declare deltaToken: string;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}
MicrosoftDeltaModel.init(
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
    rootId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    deltaToken: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "microsoft_deltas",
    indexes: [{ fields: ["connectorId", "rootId"], unique: true }],
  }
);
ConnectorModel.hasMany(MicrosoftDeltaModel);
MicrosoftRootModel.hasOne(MicrosoftDeltaModel);
