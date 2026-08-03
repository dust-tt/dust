import { ConversationModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  CreationOptional,
  ForeignKey,
  ModelAttributes,
  NonAttribute,
} from "sequelize";

export type ConversationSelectedSpaceOrigin =
  | "input_bar"
  | "parent_conversation"
  | "pod_context"
  | "sticky_preference";

const CONVERSATION_SELECTED_SPACE_MODEL_ATTRIBUTES = {
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
  spaceId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: SpaceModel,
      key: "id",
    },
  },
  selectedByUserId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: UserModel,
      key: "id",
    },
  },
  origin: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  removedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
} as const satisfies ModelAttributes;

export class ConversationSelectedSpaceModel extends WorkspaceAwareModel<ConversationSelectedSpaceModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare conversationId: ForeignKey<ConversationModel["id"]>;
  declare spaceId: ForeignKey<SpaceModel["id"]>;
  declare selectedByUserId: ForeignKey<UserModel["id"]>;
  declare origin: ConversationSelectedSpaceOrigin;
  declare removedAt: Date | null;

  declare conversation: NonAttribute<ConversationModel>;
  declare space: NonAttribute<SpaceModel>;
  declare selectedByUser: NonAttribute<UserModel>;
}

ConversationSelectedSpaceModel.init(
  CONVERSATION_SELECTED_SPACE_MODEL_ATTRIBUTES,
  {
    modelName: "conversation_selected_spaces",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        fields: ["workspaceId", "conversationId", "spaceId"],
        name: "conversation_selected_spaces_wid_cid_sid",
        concurrently: true,
      },
      {
        fields: ["conversationId"],
        name: "conversation_selected_spaces_conversation_id",
        concurrently: true,
      },
      {
        fields: ["spaceId"],
        name: "conversation_selected_spaces_space_id",
        concurrently: true,
      },
      {
        fields: ["selectedByUserId"],
        name: "conversation_selected_spaces_selected_by_user_id",
        concurrently: true,
      },
    ],
  }
);

ConversationModel.hasMany(ConversationSelectedSpaceModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "RESTRICT",
});
ConversationSelectedSpaceModel.belongsTo(ConversationModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  as: "conversation",
});

SpaceModel.hasMany(ConversationSelectedSpaceModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  onDelete: "RESTRICT",
});
ConversationSelectedSpaceModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  as: "space",
});

UserModel.hasMany(ConversationSelectedSpaceModel, {
  foreignKey: { name: "selectedByUserId", allowNull: false },
  onDelete: "RESTRICT",
});
ConversationSelectedSpaceModel.belongsTo(UserModel, {
  foreignKey: { name: "selectedByUserId", allowNull: false },
  as: "selectedByUser",
});
