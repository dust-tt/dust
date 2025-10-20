import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";

export class MicrosoftBotConfigurationModel extends ConnectorBaseModel<MicrosoftBotConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare botEnabled: boolean;
  declare tenantId: string;
}
MicrosoftBotConfigurationModel.init(
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
    botEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    tenantId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: sequelizeConnection,
    modelName: "microsoft_bot_configurations",
    indexes: [
      { fields: ["connectorId"], unique: true },
      { fields: ["tenantId"], unique: true },
    ],
    relationship: "hasOne",
  }
);

export class MicrosoftBotMessage extends ConnectorBaseModel<MicrosoftBotMessage> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userAadObjectId?: string;
  declare email?: string;
  declare conversationId: string;
  declare userActivityId: string;
  declare agentActivityId: string;
  declare replyToId?: string;
  declare dustConversationId?: string;
}

MicrosoftBotMessage.init(
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
    userAadObjectId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    conversationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userActivityId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    agentActivityId: {
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
    modelName: "microsoft_bot_messages",
    sequelize: sequelizeConnection,
    indexes: [
      {
        fields: ["connectorId"],
      },
      {
        fields: ["connectorId", "conversationId"],
      },
      {
        fields: ["connectorId", "dustConversationId"],
      },
    ],
  }
);
