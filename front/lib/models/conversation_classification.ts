import type { MESSAGE_CLASS } from "@dust-tt/types";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { Conversation } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { BaseModel } from "@app/lib/resources/storage/wrappers";

export class ConversationClassification extends BaseModel<ConversationClassification> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare messageClass: MESSAGE_CLASS;

  declare conversationId: ForeignKey<Conversation["id"]> | null;
}

ConversationClassification.init(
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

    messageClass: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "ConversationClassification",
    tableName: "conversation_classifications",
    indexes: [
      {
        fields: ["conversationId"],
        unique: true,
      },
    ],
  }
);

Conversation.hasMany(ConversationClassification);
ConversationClassification.belongsTo(Conversation);
