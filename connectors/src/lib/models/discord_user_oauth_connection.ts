import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { connectorsSequelize } from "@connectors/resources/storage";

export class DiscordUserOAuthConnectionModel extends Model<
  InferAttributes<DiscordUserOAuthConnectionModel>,
  InferCreationAttributes<DiscordUserOAuthConnectionModel>
> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare discordUserId: string;
  declare connectionId: string;
  declare workspaceId: string;
}

DiscordUserOAuthConnectionModel.init(
  {
    createdAt: {
      type: DataTypes.DATE,
    },
    updatedAt: {
      type: DataTypes.DATE,
    },
    discordUserId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    connectionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    workspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize: connectorsSequelize,
    modelName: "discord_user_oauth_connections",
    indexes: [
      { fields: ["discordUserId"] },
      { fields: ["connectionId"] },
      { fields: ["discordUserId", "workspaceId"], unique: true },
    ],
  }
);
