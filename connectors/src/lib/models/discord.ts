import { connectorsSequelize } from "@connectors/resources/storage";
import { DataTypes } from "@connectors/resources/storage/data_types";
import { ConnectorBaseModel } from "@connectors/resources/storage/wrappers/model_with_connectors";
import type { CreationOptional } from "sequelize";

export class DiscordConfigurationModel extends ConnectorBaseModel<DiscordConfigurationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare guildId: string;
  declare botEnabled: boolean;
}

DiscordConfigurationModel.init(
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
    guildId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    botEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize: connectorsSequelize,
    indexes: [
      { fields: ["guildId"] },
      { fields: ["connectorId"], unique: true },
      {
        fields: ["guildId", "botEnabled"],
        where: { botEnabled: true },
        unique: true,
      },
    ],
    modelName: "discord_configurations",
    relationship: "hasOne",
  }
);
