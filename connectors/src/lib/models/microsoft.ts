import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

export type MicrosoftResourceType =
  | "site"
  | "team"
  | "drive"
  | "folder"
  | "file"
  | "page"
  | "channel"
  | "message";

export class MicrosoftConfigurationModel extends Model<
  InferAttributes<MicrosoftConfigurationModel>,
  InferCreationAttributes<MicrosoftConfigurationModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
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
  },
  {
    sequelize: sequelizeConnection,
    modelName: "microsoft_configurations",
    indexes: [{ fields: ["connectorId"], unique: true }],
  }
);

ConnectorModel.hasMany(MicrosoftConfigurationModel);

// MicrosoftConfigurationRoot stores the drive/folders/channels selected by the user to sync.
export class MicrosoftConfigurationRootModel extends Model<
  InferAttributes<MicrosoftConfigurationRootModel>,
  InferCreationAttributes<MicrosoftConfigurationRootModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
  declare resourceType: MicrosoftResourceType;
  declare resourceId: string;
}
MicrosoftConfigurationRootModel.init(
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
    resourceType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    resourceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "microsoft_configuration_roots",
    indexes: [
      { fields: ["connectorId", "resourceId"], unique: true },
      { fields: ["connectorId", "resourceType"], unique: false },
    ],
  }
);
ConnectorModel.hasMany(MicrosoftConfigurationRootModel);

// MicrosftResource stores files/folders/channels and other resources synced from Microsoft.
export class MicrosoftResourceModel extends Model<
  InferAttributes<MicrosoftResourceModel>,
  InferCreationAttributes<MicrosoftResourceModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastSeenTs: Date | null;
  declare lastUpsertedTs: Date | null;
  declare skipReason: string | null;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
  declare dustFileId: string;
  declare resourceType: MicrosoftResourceType;
  declare resourceId: string;
  declare name: string;
  declare mimeType: string;
  declare parentId: string | null;
}
MicrosoftResourceModel.init(
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
    dustFileId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    resourceType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    resourceId: {
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
    parentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "microsoft_resources",
    indexes: [
      { fields: ["connectorId", "resourceId"], unique: true },
      { fields: ["connectorId", "resourceType"], unique: true },
      { fields: ["connectorId", "parentId"], concurrently: true },
    ],
  }
);
ConnectorModel.hasMany(MicrosoftResourceModel);

// Delta token are used for creating a diff from the last calls.
// On every delta call, we store the new delta token to be used in the next call
// For each configured root resource, we store a delta token.
export class MicrosoftDeltaModel extends Model<
  InferAttributes<MicrosoftDeltaModel>,
  InferCreationAttributes<MicrosoftDeltaModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare resourceId: ForeignKey<MicrosoftConfigurationRootModel["resourceId"]>;
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
    resourceId: {
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
    indexes: [{ fields: ["connectorId", "resourceId"], unique: true }],
  }
);
ConnectorModel.hasMany(MicrosoftDeltaModel);
MicrosoftConfigurationRootModel.hasOne(MicrosoftDeltaModel);
