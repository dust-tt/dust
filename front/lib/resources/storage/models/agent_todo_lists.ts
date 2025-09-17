import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class AgentTodoListModel extends WorkspaceAwareModel<AgentTodoListModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: string;
  declare todoListsJson: string; // JSON string containing the todo lists data

  declare userId: ForeignKey<UserModel["id"]> | null;
  declare user: NonAttribute<UserModel> | null;
}

AgentTodoListModel.init(
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
    agentConfigurationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    todoListsJson: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "{}",
    },
  },
  {
    modelName: "agent_todo_lists",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "agentConfigurationId", "userId"],
        name: "agent_todo_lists_workspace_agent_configuration_user",
        unique: true, // One todo list collection per agent/user combination
      },
    ],
  }
);

UserModel.hasOne(AgentTodoListModel, {
  foreignKey: { allowNull: true },
  onDelete: "RESTRICT",
});
