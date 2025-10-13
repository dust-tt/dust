import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";

export class TeamsMessage extends ConnectorBaseModel<TeamsMessage> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare connectorId: number;
  declare message: string;
  declare userId: string;
  declare userAadObjectId?: string;
  declare email: string;
  declare userName: string;
  declare conversationId: string;
  declare activityId: string;
  declare channelId: string;
  declare replyToId?: string;
  declare dustConversationId?: string;
}

TeamsMessage.init(
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
    connectorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userAadObjectId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    conversationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    activityId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    channelId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    replyToId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dustConversationId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "teams_messages",
    sequelize: sequelizeConnection,
    indexes: [
      {
        fields: ["connectorId"],
      },
      {
        fields: ["conversationId"],
      },
      {
        fields: ["userId"],
      },
      {
        fields: ["dustConversationId"],
      },
    ],
  }
);
