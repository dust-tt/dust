import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class ProjectMetadataModel extends WorkspaceAwareModel<ProjectMetadataModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare spaceId: ForeignKey<SpaceModel["id"]>;

  declare description: string | null;
  declare urls: string[];
  declare tags: string[];
  declare emoji: string | null;
  declare color: string | null;
}

ProjectMetadataModel.init(
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
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    urls: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    tags: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    emoji: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    color: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "project_metadata",
    sequelize: frontSequelize,
    indexes: [
      // Unique constraint: one metadata per space (1:1 relationship)
      { unique: true, fields: ["spaceId"] },
      // Index on spaceId for efficient lookups (required for FK per BACK13)
      { fields: ["spaceId"], concurrently: true },
    ],
  }
);

// Define the relationship: ProjectMetadata belongs to Space
ProjectMetadataModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  onDelete: "CASCADE",
});

// Define the reverse relationship: Space has one ProjectMetadata
SpaceModel.hasOne(ProjectMetadataModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  as: "projectMetadata",
});
