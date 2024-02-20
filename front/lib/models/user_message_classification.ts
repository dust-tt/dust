import type { MESSAGE_CLASS } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import { UserMessage } from "@app/lib/models/assistant/conversation";

export class UserMessageClassification extends Model<
  InferAttributes<UserMessageClassification>,
  InferCreationAttributes<UserMessageClassification>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare messageClass: MESSAGE_CLASS;

  declare userMessageId: ForeignKey<UserMessage["id"]> | null;
}

UserMessageClassification.init(
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
    modelName: "UserMessageClassification",
    tableName: "user_message_classifications",
  }
);

UserMessage.hasMany(UserMessageClassification);
UserMessageClassification.belongsTo(UserMessage);
