import type {
  ContentFragmentVersion,
  SupportedContentFragmentType,
} from "@dust-tt/types";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import type { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class ContentFragmentModel extends WorkspaceAwareModel<ContentFragmentModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare title: string;
  declare contentType: SupportedContentFragmentType;
  declare sourceUrl: string | null; // GCS (upload) or Slack or ...

  // The field below should be set for all fragments that are converted to text
  // before being put in model context (PDF, text, CSV, future: .docx...)
  declare textBytes: number | null;

  // user-related context
  declare userContextUsername: string | null;
  declare userContextFullName: string | null;
  declare userContextEmail: string | null;
  declare userContextProfilePictureUrl: string | null;

  declare userId: ForeignKey<UserModel["id"]> | null;
  declare fileId: ForeignKey<FileModel["id"]> | null;

  declare nodeId: string | null;
  declare nodeDataSourceViewId: ForeignKey<DataSourceViewModel["id"]> | null;

  declare version: ContentFragmentVersion;
}

ContentFragmentModel.init(
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
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    title: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    contentType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sourceUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    textBytes: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    userContextProfilePictureUrl: {
      type: DataTypes.STRING(2048),
      allowNull: true,
    },
    userContextUsername: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userContextFullName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userContextEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    version: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "latest",
    },
    nodeId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "content_fragment",
    sequelize: frontSequelize,
    indexes: [{ fields: ["fileId"] }, { fields: ["sId", "version"] }],
  }
);

UserModel.hasMany(ContentFragmentModel, {
  foreignKey: { name: "userId", allowNull: true }, // null = ContentFragment is not associated with a user
});
ContentFragmentModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: true },
});

ContentFragmentModel.belongsTo(FileModel, {
  foreignKey: { name: "fileId", allowNull: true },
});
FileModel.hasOne(ContentFragmentModel, {
  foreignKey: { name: "fileId", allowNull: true },
});
