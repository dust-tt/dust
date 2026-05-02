import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

export class ProjectMetadataModel extends WorkspaceAwareModel<ProjectMetadataModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare archivedAt: CreationOptional<Date | null>;
  declare lastTodoAnalysisAt: CreationOptional<Date | null>;
  declare todoGenerationEnabled: CreationOptional<boolean>;
  /** First-run window only; cleared after first successful analysis. Internal / workflow. */
  declare initialTodoAnalysisLookback: CreationOptional<string | null>;
  declare spaceId: ForeignKey<SpaceModel["id"]>;

  declare description: string | null;
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
    archivedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastTodoAnalysisAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    todoGenerationEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    initialTodoAnalysisLookback: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "project_metadata",
    sequelize: frontSequelize,
    indexes: [
      { unique: true, fields: ["spaceId"], concurrently: true },
      { fields: ["workspaceId"], concurrently: true },
    ],
  }
);

// Define the relationship: ProjectMetadata belongs to Space
ProjectMetadataModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  onDelete: "RESTRICT",
});

// Define the reverse relationship: Space has one ProjectMetadata
SpaceModel.hasOne(ProjectMetadataModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  as: "projectMetadata",
});
