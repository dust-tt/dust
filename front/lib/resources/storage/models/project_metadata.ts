import { frontSequelize } from "@app/lib/resources/storage";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
} from "@app/lib/resources/storage/data_types";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { PodFrameTab } from "@app/types/pod_frame_tab";
import type { CreationOptional, ForeignKey } from "sequelize";

export class ProjectMetadataModel extends WorkspaceAwareModel<ProjectMetadataModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare archivedAt: CreationOptional<Date | null>;
  declare lastTodoAnalysisAt: CreationOptional<Date | null>;
  declare todoGenerationEnabled: CreationOptional<boolean>;
  /** First-run window only; cleared after first successful analysis. Internal / workflow. */
  declare initialTodoAnalysisLookback: CreationOptional<string | null>;
  /**
   * When true, workspace admins control membership and can attach connected data
   * (Space DataSourceViews) to this Pod. Opt-in; gated by `admin_controlled_pods`.
   */
  declare isAdminControlled: CreationOptional<boolean>;
  /**
   * When true, every active workspace member may invoke this Pod's published functions
   * (and use its shared Frames) without membership. Grants no read/write on the Pod.
   */
  declare appSharingEnabled: CreationOptional<boolean>;
  declare spaceId: ForeignKey<SpaceModel["id"]>;

  declare description: string | null;
  /** Scoped path to a project frame file, e.g. `project/banner.html`. */
  declare pinnedFramePath: CreationOptional<string | null>;
  /** Frames promoted as custom pod tabs (shared). */
  declare frameTabs: CreationOptional<PodFrameTab[]>;
  /**
   * Interleaved nav order before Settings: system tab ids + frame paths.
   * Empty means default (system tabs then frame paths).
   */
  declare tabsOrder: CreationOptional<string[]>;
  /** sId of the agent pre-selected for new conversations in this pod. Null = @dust. */
  declare defaultAgentId: CreationOptional<string | null>;
  declare defaultSkillsIds: CreationOptional<string[] | null>;
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
      type: DANGEROUSLY_UNBOUNDED_TEXT,
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
    isAdminControlled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    appSharingEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    initialTodoAnalysisLookback: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    pinnedFramePath: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    frameTabs: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    tabsOrder: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    defaultAgentId: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
      field: "defaultAgentSId",
    },
    defaultSkillsIds: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: null,
      field: "defaultSkillsIds",
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
