import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { Connector } from "@connectors/lib/models";
import { sequelizeConnection } from "@connectors/resources/storage";

export class GoogleDriveConfig extends Model<
  InferAttributes<GoogleDriveConfig>,
  InferCreationAttributes<GoogleDriveConfig>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare connectorId: ForeignKey<Connector["id"]>;
  declare pdfEnabled: boolean;
}
GoogleDriveConfig.init(
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
  },
  {
    sequelize: sequelizeConnection,
    modelName: "google_drive_configs",
    indexes: [{ fields: ["connectorId"], unique: true }],
  }
);
// GoogleDriveFolders stores the folders selected by the user to sync.

export class GoogleDriveFolders extends Model<
  InferAttributes<GoogleDriveFolders>,
  InferCreationAttributes<GoogleDriveFolders>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare connectorId: ForeignKey<Connector["id"]>;
  declare folderId: string;
}
GoogleDriveFolders.init(
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
    folderId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "google_drive_folders",
    indexes: [{ fields: ["connectorId", "folderId"], unique: true }],
  }
);
Connector.hasOne(GoogleDriveFolders);
// GoogleDriveFiles stores files and folders synced from Google Drive.

export class GoogleDriveFiles extends Model<
  InferAttributes<GoogleDriveFiles>,
  InferCreationAttributes<GoogleDriveFiles>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastSeenTs: Date | null;
  declare lastUpsertedTs: Date | null;
  declare skipReason: string | null;
  declare connectorId: ForeignKey<Connector["id"]>;
  declare dustFileId: string;
  declare driveFileId: string;
  declare name: string;
  declare mimeType: string;
  declare parentId: string | null;
}
GoogleDriveFiles.init(
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
    driveFileId: {
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
    modelName: "google_drive_files",
    indexes: [
      { fields: ["connectorId", "driveFileId"], unique: true },
      { fields: ["connectorId", "parentId"], concurrently: true },
    ],
  }
);
Connector.hasOne(GoogleDriveFiles);
// Sync Token are the equivalent of a timestamp for syncing the delta
// between the last sync and the current sync.

export class GoogleDriveSyncToken extends Model<
  InferAttributes<GoogleDriveSyncToken>,
  InferCreationAttributes<GoogleDriveSyncToken>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare driveId: string;
  declare syncToken: string;
  declare connectorId: ForeignKey<Connector["id"]>;
}
GoogleDriveSyncToken.init(
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
    driveId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    syncToken: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "google_drive_sync_tokens",
    indexes: [{ fields: ["connectorId", "driveId"], unique: true }],
  }
);
Connector.hasOne(GoogleDriveSyncToken);

export class GoogleDriveWebhook extends Model<
  InferAttributes<GoogleDriveWebhook>,
  InferCreationAttributes<GoogleDriveWebhook>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare webhookId: string;
  declare renewedByWebhookId: string | null;
  declare expiresAt: Date;
  declare renewAt: Date | null;
  declare connectorId: ForeignKey<Connector["id"]>;
}
GoogleDriveWebhook.init(
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
    webhookId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    renewedByWebhookId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    renewAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "google_drive_webhooks",
    indexes: [
      { fields: ["webhookId"], unique: true },
      { fields: ["renewAt"] },
      { fields: ["connectorId"] },
    ],
  }
);
Connector.hasOne(GoogleDriveWebhook);
