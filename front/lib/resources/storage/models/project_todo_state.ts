import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

export class ProjectTodoStateModel extends WorkspaceAwareModel<ProjectTodoStateModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare spaceId: ForeignKey<SpaceModel["id"]>;
  declare userId: ForeignKey<UserModel["id"]>;
  declare lastReadAt: Date;

  declare space: NonAttribute<SpaceModel>;
  declare user: NonAttribute<UserModel>;
}

ProjectTodoStateModel.init(
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
    lastReadAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    spaceId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    userId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      comment: "Owner of the state.",
    },
  },
  {
    modelName: "project_todo_state",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "spaceId", "userId"],
        unique: true,
        concurrently: true,
      },
      { fields: ["spaceId"], concurrently: true },
      { fields: ["userId"], concurrently: true },
    ],
  }
);

ProjectTodoStateModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  onDelete: "RESTRICT",
});

ProjectTodoStateModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});

SpaceModel.hasMany(ProjectTodoStateModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  as: "projectTodoStates",
});
