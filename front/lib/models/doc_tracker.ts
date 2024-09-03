import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { User } from "@app/lib/models/user";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSource } from "@app/lib/resources/storage/models/data_source";

export class TrackedDocument extends Model<
  InferAttributes<TrackedDocument>,
  InferCreationAttributes<TrackedDocument>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare documentId: string;
  declare trackingEnabledAt: Date | null;

  declare userId: ForeignKey<User["id"]>;
  declare dataSourceId: ForeignKey<DataSource["id"]>;
}

TrackedDocument.init(
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

DataSource.hasMany(TrackedDocument, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
User.hasMany(TrackedDocument, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});

export class DocumentTrackerChangeSuggestion extends Model<
  InferAttributes<DocumentTrackerChangeSuggestion>,
  InferCreationAttributes<DocumentTrackerChangeSuggestion>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare suggestion: string;
  declare reason: string | null;
  declare status: "pending" | "done" | "rejected";

  declare trackedDocumentId: ForeignKey<TrackedDocument["id"]>;
  declare sourceDataSourceId: ForeignKey<DataSource["id"]>;
  declare sourceDocumentId: string;
}

DocumentTrackerChangeSuggestion.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
    suggestion: { type: DataTypes.TEXT, allowNull: false },
    //@ts-expect-error TODO remove once propagated
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
DataSource.hasMany(DocumentTrackerChangeSuggestion, {
  foreignKey: { allowNull: false, name: "sourceDataSourceId" },
  onDelete: "CASCADE",
});
