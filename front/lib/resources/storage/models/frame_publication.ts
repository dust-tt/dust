import { frontSequelize } from "@app/lib/resources/storage";
import type {
  CreationOptional,
  ForeignKey,
} from "@app/lib/resources/storage/data_types";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
} from "@app/lib/resources/storage/data_types";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

/**
 * One row per immutable Frames v2 publication. The publication's content lives in GCS under
 * `publications/<publicationId>/`, committed by its `publication.json`; this row mirrors the
 * descriptor fields worth querying. Which publication a Frame serves is still recorded on the
 * Frame (`useCaseMetadata.activePublicationId`).
 */
export class FramePublicationModel extends WorkspaceAwareModel<FramePublicationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare fileId: ForeignKey<FileModel["id"]>;
  declare publicationId: string;
  declare publishedAt: Date;
  declare publishedByUserId: ForeignKey<UserModel["id"]> | null;
  declare publishedByAgentConfigurationId: string | null;
  declare description: string;
  declare uiBundleSha256: string;
}

FramePublicationModel.init(
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
    fileId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    publicationId: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    publishedByAgentConfigurationId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
    },
    description: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
    },
    uiBundleSha256: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
  },
  {
    modelName: "frame_publication",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "fileId", "publicationId"],
        unique: true,
        concurrently: true,
      },
      {
        fields: ["fileId"],
        concurrently: true,
      },
      {
        fields: ["publishedByUserId"],
        concurrently: true,
      },
    ],
  }
);

FramePublicationModel.belongsTo(FileModel, {
  foreignKey: { name: "fileId", allowNull: false },
  onDelete: "RESTRICT",
});
FileModel.hasMany(FramePublicationModel, {
  foreignKey: { name: "fileId", allowNull: false },
  onDelete: "RESTRICT",
});

FramePublicationModel.belongsTo(UserModel, {
  foreignKey: { name: "publishedByUserId", allowNull: true },
  onDelete: "SET NULL",
});
UserModel.hasMany(FramePublicationModel, {
  foreignKey: { name: "publishedByUserId", allowNull: true },
  onDelete: "SET NULL",
});
