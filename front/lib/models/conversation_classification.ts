import type { MESSAGE_CLASS } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import { Conversation } from "@app/lib/models/assistant/conversation";

export class ConversationClassification extends Model<
  InferAttributes<ConversationClassification>,
  InferCreationAttributes<ConversationClassification>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare messageClass: MESSAGE_CLASS;

  declare conversationId: ForeignKey<Conversation["id"]> | null;
}

ConversationClassification.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

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
    sequelize: front_sequelize,
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
