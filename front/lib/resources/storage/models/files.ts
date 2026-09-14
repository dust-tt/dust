import { frontSequelize } from "@app/lib/resources/storage";
import type {
  CreationOptional,
  ForeignKey,
  NonAttribute,
} from "@app/lib/resources/storage/data_types";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
  literal,
  Op,
} from "@app/lib/resources/storage/data_types";
import { FileSystemNodeModel } from "@app/lib/resources/storage/models/file_system_node";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  AllSupportedFileContentType,
  AuthorizedFileAccessKind,
  FileShareScope,
  FileStatus,
  FileUseCase,
  FileUseCaseMetadata,
} from "@app/types/files";
import { frameV2ContentType } from "@app/types/files";

export class FileModel extends WorkspaceAwareModel<FileModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare contentType: AllSupportedFileContentType;
  declare fileName: string;
  declare fileSize: number;
  declare version: number;
  declare snippet: string | null;
  declare status: FileStatus;
  declare useCase: FileUseCase;
  declare useCaseMetadata: FileUseCaseMetadata | null;
  declare mountFilePath: string | null;

  declare userId: ForeignKey<UserModel["id"]> | null;
  // The file system node holding this file's live source. For a Frame this is
  // the published entry file. The id survives every move and rename.
  declare fileSystemNodeId: ForeignKey<FileSystemNodeModel["id"]> | null;

  declare user: NonAttribute<UserModel>;
}
FileModel.init(
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
    contentType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fileName: {
      type: DataTypes.STRING(4096),
      allowNull: false,
    },
    fileSize: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    useCase: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    useCaseMetadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
    snippet: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: true,
      defaultValue: null,
    },
    mountFilePath: {
      type: DataTypes.STRING(4096),
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "files",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId", "id"] },
      { fields: ["workspaceId", "userId"] },
      {
        fields: [
          "workspaceId",
          "useCase",
          "status",
          // index on the JSONB field, not the best but it works
          literal("(\"useCaseMetadata\" #>> '{spaceId}')"),
        ],
      },
      {
        fields: ["workspaceId", "mountFilePath"],
        unique: true,
        where: { mountFilePath: { [Op.ne]: null } },
      },
      {
        // Poke's workspace Frames list orders by updatedAt within a workspace. Partial so the
        // index stays small: Frames are a tiny fraction of the files table. Plain ascending —
        // Postgres scans a btree backwards at the same cost, so this serves ORDER BY DESC.
        name: "files_workspace_id_frame_v2_updated_at",
        fields: ["workspaceId", "updatedAt"],
        concurrently: true,
        where: { contentType: frameV2ContentType },
      },
      {
        fields: ["fileSystemNodeId"],
        concurrently: true,
        where: { fileSystemNodeId: { [Op.ne]: null } },
      },
    ],
  }
);
UserModel.hasMany(FileModel, {
  foreignKey: { allowNull: true },
  onDelete: "RESTRICT",
});
FileModel.belongsTo(UserModel);
FileSystemNodeModel.hasMany(FileModel, {
  foreignKey: { name: "fileSystemNodeId", allowNull: true },
  onDelete: "RESTRICT",
});
FileModel.belongsTo(FileSystemNodeModel, {
  foreignKey: { name: "fileSystemNodeId", allowNull: true },
});

/**
 * Shared files logic.
 */

export class ShareableFileModel extends WorkspaceAwareModel<ShareableFileModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare expiresAt: Date | null;
  declare sharedAt: Date;
  declare shareScope: FileShareScope;
  declare token: string; // The token is a UUID v4.

  declare fileId: ForeignKey<FileModel["id"]>;
  declare sharedBy: ForeignKey<UserModel["id"]> | null;

  declare file?: NonAttribute<FileModel>;
  declare sharedByUser?: NonAttribute<UserModel> | null;
}

ShareableFileModel.init(
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
    token: {
      type: DataTypes.UUID,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    shareScope: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sharedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "shareable_files",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId", "shareScope"], unique: false },
      { fields: ["token"], unique: true },
      { fields: ["fileId"], unique: true, concurrently: true },
    ],
  }
);

// FileModel has one ShareableFileModel.
FileModel.hasOne(ShareableFileModel, {
  foreignKey: { name: "fileId", allowNull: false },
  onDelete: "RESTRICT",
});
ShareableFileModel.belongsTo(FileModel, {
  foreignKey: { name: "fileId", allowNull: false },
});

// UserModel has many ShareableFileModel (who shared it).
UserModel.hasMany(ShareableFileModel, {
  foreignKey: { name: "sharedBy", allowNull: true },
  onDelete: "RESTRICT",
});
ShareableFileModel.belongsTo(UserModel, {
  foreignKey: { name: "sharedBy", allowNull: true },
});

/**
 * Sharing grants: email-level ACL for restricted sharing.
 */

export class SharingGrantModel extends WorkspaceAwareModel<SharingGrantModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare email: string;
  declare grantedAt: Date;
  declare expiresAt: Date | null;
  declare revokedAt: Date | null;
  declare lastViewedAt: Date | null;

  declare shareableFileId: ForeignKey<ShareableFileModel["id"]>;
  declare grantedBy: ForeignKey<UserModel["id"]> | null;

  declare shareableFile?: NonAttribute<ShareableFileModel>;
  declare grantedByUser?: NonAttribute<UserModel> | null;
}

SharingGrantModel.init(
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
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    grantedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    lastViewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "sharing_grants",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "shareableFileId"],
        where: { revokedAt: null },
      },
      {
        fields: ["workspaceId", "email"],
        where: { revokedAt: null },
      },
      {
        fields: ["workspaceId", "shareableFileId", "email"],
        unique: true,
        where: { revokedAt: null },
      },
    ],
  }
);

ShareableFileModel.hasMany(SharingGrantModel, {
  foreignKey: { name: "shareableFileId", allowNull: false },
  onDelete: "RESTRICT",
});
SharingGrantModel.belongsTo(ShareableFileModel, {
  foreignKey: { name: "shareableFileId", allowNull: false },
});

UserModel.hasMany(SharingGrantModel, {
  foreignKey: { name: "grantedBy", allowNull: true },
  onDelete: "SET NULL",
});
SharingGrantModel.belongsTo(UserModel, {
  foreignKey: { name: "grantedBy", allowNull: true },
});

/**
 * Authorized file access: one row per file a shared Frame may load via useFile().
 * Active rows have revokedAt = null.
 */

export class AuthorizedFileAccessModel extends WorkspaceAwareModel<AuthorizedFileAccessModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare kind: AuthorizedFileAccessKind;
  declare ref: string;
  declare fileName: string | null;
  declare legacyPath: string | null;
  declare shareScope: FileShareScope;
  declare generatedByUserId: ForeignKey<UserModel["id"]> | null;
  declare frameContentHash: string;
  declare allowedAt: Date;

  declare shareableFileId: ForeignKey<ShareableFileModel["id"]>;

  declare shareableFile?: NonAttribute<ShareableFileModel>;
  declare generatedByUser?: NonAttribute<UserModel | null>;
}

AuthorizedFileAccessModel.init(
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
    kind: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    ref: {
      type: DataTypes.STRING(4096),
      allowNull: false,
    },
    fileName: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    legacyPath: {
      type: DataTypes.STRING(4096),
      allowNull: true,
      defaultValue: null,
    },
    shareScope: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    frameContentHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    allowedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    modelName: "authorized_file_access",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId"], concurrently: true },
      { fields: ["shareableFileId"], concurrently: true },
      { fields: ["generatedByUserId"], concurrently: true },
    ],
  }
);

ShareableFileModel.hasMany(AuthorizedFileAccessModel, {
  foreignKey: { name: "shareableFileId", allowNull: false },
  onDelete: "RESTRICT",
});
AuthorizedFileAccessModel.belongsTo(ShareableFileModel, {
  foreignKey: { name: "shareableFileId", allowNull: false },
});

UserModel.hasMany(AuthorizedFileAccessModel, {
  foreignKey: { name: "generatedByUserId", allowNull: true },
  onDelete: "SET NULL",
});
AuthorizedFileAccessModel.belongsTo(UserModel, {
  as: "generatedByUser",
  foreignKey: { name: "generatedByUserId", allowNull: true },
  onDelete: "SET NULL",
});

/**
 * External viewer sessions: cookie-based sessions for email-verified external viewers.
 * Scoped to a workspace. One session covers all frames shared with that email in the workspace.
 */

export class ExternalViewerSessionModel extends WorkspaceAwareModel<ExternalViewerSessionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sessionToken: string;
  declare email: string;
  declare expiresAt: Date;
}

ExternalViewerSessionModel.init(
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
    sessionToken: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    modelName: "external_viewer_sessions",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["sessionToken"], unique: true },
      { fields: ["workspaceId", "email"] },
    ],
  }
);
