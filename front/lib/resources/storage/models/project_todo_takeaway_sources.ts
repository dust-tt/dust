import { frontSequelize } from "@app/lib/resources/storage";
import { ProjectTodoModel } from "@app/lib/resources/storage/models/project_todo";
import { TakeawaySourcesModel } from "@app/lib/resources/storage/models/takeaways";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

// ── Project todo takeaway sources ──────────────────────────────────────────────────
// Links a ProjectTodo to the TakeawaySources entries that contributed to
// creating or updating it.
export class ProjectTodoTakeawaySourcesModel extends WorkspaceAwareModel<ProjectTodoTakeawaySourcesModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare projectTodoId: ForeignKey<ProjectTodoModel["id"]>;
  declare takeawaySourceId: ForeignKey<TakeawaySourcesModel["id"]>;

  declare projectTodo: NonAttribute<ProjectTodoModel>;
  declare takeawaySource: NonAttribute<TakeawaySourcesModel>;
}

ProjectTodoTakeawaySourcesModel.init(
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
    projectTodoId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    takeawaySourceId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
  },
  {
    modelName: "project_todo_takeaway_sources",
    tableName: "project_todo_takeaway_sources",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "project_todo_takeaway_sources_ws_todo_idx",
        fields: ["workspaceId", "projectTodoId"],
        concurrently: true,
      },
      {
        name: "project_todo_takeaway_sources_unique_idx",
        fields: ["workspaceId", "projectTodoId", "takeawaySourceId"],
        unique: true,
        concurrently: true,
      },
      {
        name: "project_todo_takeaway_sources_project_todo_id_idx",
        fields: ["projectTodoId"],
        concurrently: true,
      },
      {
        name: "project_todo_takeaway_sources_takeaway_source_id_idx",
        fields: ["takeawaySourceId"],
        concurrently: true,
      },
    ],
  }
);

ProjectTodoTakeawaySourcesModel.belongsTo(ProjectTodoModel, {
  foreignKey: { name: "projectTodoId", allowNull: false },
  onDelete: "RESTRICT",
  as: "projectTodo",
});

ProjectTodoModel.hasMany(ProjectTodoTakeawaySourcesModel, {
  foreignKey: { name: "projectTodoId", allowNull: false },
  as: "takeawaySources",
});

ProjectTodoTakeawaySourcesModel.belongsTo(TakeawaySourcesModel, {
  foreignKey: { name: "takeawaySourceId", allowNull: false },
  onDelete: "RESTRICT",
  as: "takeawaySource",
});

TakeawaySourcesModel.hasMany(ProjectTodoTakeawaySourcesModel, {
  foreignKey: { name: "takeawaySourceId", allowNull: false },
  as: "projectTodoTakeawaySources",
});
