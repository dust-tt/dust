import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { MCPServerViewModel } from "@app/lib/models/assistant/actions/mcp_server_view";
import { ConversationModel } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class ConversationMCPServerViewModel extends WorkspaceAwareModel<ConversationMCPServerViewModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare conversationId: ForeignKey<ConversationModel["id"]>;
  declare mcpServerViewId: ForeignKey<MCPServerViewModel["id"]>;
  declare userId: ForeignKey<UserModel["id"]>;
  declare enabled: CreationOptional<boolean>;

  // Associations
  declare conversation: NonAttribute<ConversationModel>;
  declare mcpServerView: NonAttribute<MCPServerViewModel>;
  declare user: NonAttribute<UserModel>;
}

ConversationMCPServerViewModel.init(
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
    conversationId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: ConversationModel,
        key: "id",
      },
    },
    mcpServerViewId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: MCPServerViewModel,
        key: "id",
      },
    },
    userId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: UserModel,
        key: "id",
      },
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    modelName: "conversation_mcp_server_view",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        fields: ["conversationId", "mcpServerViewId"],
        name: "conversation_mcp_server_views_conversation_mcp_server_view_un",
      },
      {
        fields: ["workspaceId", "conversationId"],
        name: "conversation_mcp_server_views_workspace_conversation_idx",
      },
      {
        fields: ["workspaceId", "mcpServerViewId"],
        name: "conversation_mcp_server_views_workspace_mcp_server_view_idx",
      },
      {
        fields: ["userId"],
        name: "conversation_mcp_server_views_user_idx",
      },
    ],
  }
);

// Set up associations
ConversationModel.hasMany(ConversationMCPServerViewModel, {
  foreignKey: "conversationId",
  onDelete: "CASCADE",
});

ConversationMCPServerViewModel.belongsTo(ConversationModel, {
  foreignKey: "conversationId",
});

MCPServerViewModel.hasMany(ConversationMCPServerViewModel, {
  foreignKey: "mcpServerViewId",
  onDelete: "CASCADE",
});

ConversationMCPServerViewModel.belongsTo(MCPServerViewModel, {
  foreignKey: "mcpServerViewId",
});

UserModel.hasMany(ConversationMCPServerViewModel, {
  foreignKey: "userId",
  onDelete: "CASCADE",
});

ConversationMCPServerViewModel.belongsTo(UserModel, {
  foreignKey: "userId",
});
