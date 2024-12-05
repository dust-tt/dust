import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { BaseModel } from "@app/lib/resources/storage/wrappers";

export class TrackedDocument extends BaseModel<TrackedDocument> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare documentId: string;
  declare trackingEnabledAt: Date | null;

  declare userId: ForeignKey<UserModel["id"]>;
  declare dataSourceId: ForeignKey<DataSourceModel["id"]>;
}

TrackedDocument.init(
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
    documentId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    trackingEnabledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    modelName: "tracked_document",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["userId", "dataSourceId", "documentId"], unique: true },
      { fields: ["dataSourceId"] },
    ],
  }
);

DataSourceModel.hasMany(TrackedDocument, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
UserModel.hasMany(TrackedDocument, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});

export class DocumentTrackerChangeSuggestion extends BaseModel<DocumentTrackerChangeSuggestion> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare suggestion: string;
  declare reason: string | null;
  declare status: "pending" | "done" | "rejected";

  declare trackedDocumentId: ForeignKey<TrackedDocument["id"]>;
  declare sourceDataSourceId: ForeignKey<DataSourceModel["id"]>;
  declare sourceDocumentId: string;
}

DocumentTrackerChangeSuggestion.init(
  {
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
    suggestion: { type: DataTypes.TEXT, allowNull: false },
    suggestionTitle: { type: DataTypes.TEXT, allowNull: true },
    reason: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",
    },
    sourceDocumentId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "document_tracker_change_suggestion",
    sequelize: frontSequelize,
    indexes: [{ fields: ["trackedDocumentId"] }],
  }
);

TrackedDocument.hasMany(DocumentTrackerChangeSuggestion, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
DataSourceModel.hasMany(DocumentTrackerChangeSuggestion, {
  foreignKey: { allowNull: false, name: "sourceDataSourceId" },
  onDelete: "CASCADE",
});
