import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import type { TablesErrorType } from "@connectors/lib/error";
import { connectorsSequelize } from "@connectors/resources/storage";
import type { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";

export class GoogleDriveConfig extends ConnectorBaseModel<GoogleDriveConfig> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
  declare pdfEnabled: boolean;
  declare csvEnabled: boolean;
  declare largeFilesEnabled: boolean;
}
GoogleDriveConfig.init(
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
    sequelize: connectorsSequelize,
    modelName: "google_drive_configs",
    indexes: [{ fields: ["connectorId"], unique: true }],
    relationship: "hasOne",
  }
);

// GoogleDriveFolders stores the folders selected by the user to sync.
export class GoogleDriveFolders extends ConnectorBaseModel<GoogleDriveFolders> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
  declare folderId: string;
}
GoogleDriveFolders.init(
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
    folderId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: connectorsSequelize,
    modelName: "google_drive_folders",
    indexes: [{ fields: ["connectorId", "folderId"], unique: true }],
  }
);

// GoogleDriveFiles stores files and folders synced from Google Drive.
export class GoogleDriveFiles extends ConnectorBaseModel<GoogleDriveFiles> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastSeenTs: Date | null;
  declare lastUpsertedTs: Date | null;
  declare skipReason: string | null;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
  declare dustFileId: string;
  declare driveFileId: string;
  declare name: string;
  declare mimeType: string;
  declare parentId: string | null;
}
GoogleDriveFiles.init(
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
    sequelize: connectorsSequelize,
    modelName: "google_drive_files",
    indexes: [
      { fields: ["connectorId", "driveFileId"], unique: true },
      { fields: ["connectorId", "parentId"], concurrently: true },
    ],
  }
);

export class GoogleDriveSheet extends ConnectorBaseModel<GoogleDriveSheet> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
  declare driveFileId: string;
  declare driveSheetId: number;
  declare name: string;
  declare notUpsertedReason: TablesErrorType | null;
}
GoogleDriveSheet.init(
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
    driveFileId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    driveSheetId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    notUpsertedReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize: connectorsSequelize,
    modelName: "google_drive_sheets",
    indexes: [
      { fields: ["connectorId", "driveFileId", "driveSheetId"], unique: true },
    ],
  }
);

// Sync Token are the equivalent of a timestamp for syncing the delta
// between the last sync and the current sync.
export class GoogleDriveSyncToken extends ConnectorBaseModel<GoogleDriveSyncToken> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  // The driveId is the Google Drive Id of the user's drive.
  // For files not living in a specific drive, the driveId is "userspace".
  // We use a virtual drive ID instead of "null" because there might be other concepts of "spaces"
  // and this would allow us to support them.
  declare driveId: string;
  declare syncToken: string;
  declare connectorId: ForeignKey<ConnectorModel["id"]>;
}
GoogleDriveSyncToken.init(
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
    sequelize: connectorsSequelize,
    modelName: "google_drive_sync_tokens",
    indexes: [{ fields: ["connectorId", "driveId"], unique: true }],
  }
);
