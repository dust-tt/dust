import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export type ProjectStatus = "active" | "paused" | "completed" | "archived";

export class ProjectMetadataModel extends WorkspaceAwareModel<ProjectMetadataModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare spaceId: ForeignKey<SpaceModel["id"]>;
  declare status: ProjectStatus;
  declare description: string | null;
  declare tags: string[] | null;
  declare externalLinks: { title: string; url: string }[] | null;

  declare space: NonAttribute<SpaceModel>;
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
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "active",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    tags: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    externalLinks: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    modelName: "project_metadata",
    tableName: "project_metadata",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        fields: ["spaceId"],
        name: "project_metadata_space_id_unique",
      },
      { fields: ["workspaceId"], concurrently: true },
      { fields: ["status"], concurrently: true },
    ],
  }
);

ProjectMetadataModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  onDelete: "CASCADE",
});

SpaceModel.hasOne(ProjectMetadataModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  as: "projectMetadata",
});
