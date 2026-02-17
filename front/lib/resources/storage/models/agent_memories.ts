import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

export class AgentMemoryModel extends WorkspaceAwareModel<AgentMemoryModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare agentConfigurationId: string;
  declare content: string;

  declare userId: ForeignKey<UserModel["id"]> | null;
  declare user: NonAttribute<UserModel> | null;
}
AgentMemoryModel.init(
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
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    modelName: "agent_memories",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "agentConfigurationId", "userId", "updatedAt"],
        name: "agent_memories_workspace_agent_configuration_user_updated_at",
      },
    ],
  }
);

UserModel.hasMany(AgentMemoryModel, {
  foreignKey: { allowNull: true },
  onDelete: "RESTRICT",
});
