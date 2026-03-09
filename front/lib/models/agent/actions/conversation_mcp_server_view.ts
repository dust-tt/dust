import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes, Op } from "sequelize";

export class ConversationMCPServerViewModel extends WorkspaceAwareModel<ConversationMCPServerViewModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare conversationId: ForeignKey<ConversationModel["id"]>;
  declare mcpServerViewId: ForeignKey<MCPServerViewModel["id"]>;
  declare userId: ForeignKey<UserModel["id"]>;
  declare enabled: CreationOptional<boolean>;
  declare source: string;
  declare agentConfigurationId: string | null;

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
    source: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    agentConfigurationId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "conversation_mcp_server_view",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        fields: ["workspaceId", "conversationId", "mcpServerViewId"],
        name: "idx_conv_mcp_srv_views_wid_cid_msvi_null_agent",
        where: { agentConfigurationId: null },
        concurrently: true,
      },
      {
        unique: true,
        fields: [
          "workspaceId",
          "conversationId",
          "mcpServerViewId",
          "agentConfigurationId",
        ],
        name: "idx_conv_mcp_srv_views_wid_cid_msvi_agent",
        where: { agentConfigurationId: { [Op.ne]: null } },
        concurrently: true,
      },
      {
        fields: ["workspaceId", "conversationId"],
        name: "conversation_mcp_server_views_workspace_conversation_idx",
      },
      {
        fields: ["conversationId"],
        name: "conversation_mcp_server_views_conversation_id",
        concurrently: true,
      },
    ],
  }
);

// Set up associations
ConversationModel.hasMany(ConversationMCPServerViewModel, {
  foreignKey: "conversationId",
  onDelete: "RESTRICT",
});

ConversationMCPServerViewModel.belongsTo(ConversationModel, {
  foreignKey: "conversationId",
});

MCPServerViewModel.hasMany(ConversationMCPServerViewModel, {
  foreignKey: "mcpServerViewId",
  onDelete: "RESTRICT",
});

ConversationMCPServerViewModel.belongsTo(MCPServerViewModel, {
  foreignKey: "mcpServerViewId",
});

UserModel.hasMany(ConversationMCPServerViewModel, {
  foreignKey: "userId",
  onDelete: "RESTRICT",
});

ConversationMCPServerViewModel.belongsTo(UserModel, {
  foreignKey: "userId",
});
