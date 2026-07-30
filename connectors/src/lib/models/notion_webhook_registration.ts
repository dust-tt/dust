import { connectorsSequelize } from "@connectors/resources/storage";
import { DataTypes } from "@connectors/resources/storage/data_types";
import { BaseModel } from "@connectors/resources/storage/wrappers/base";
import type { CreationOptional } from "sequelize";

export class NotionWebhookRegistrationModel extends BaseModel<NotionWebhookRegistrationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare notionWorkspaceId: string;
  declare tokenHash: string;
  declare expiresAt: Date;
  declare usedAt: Date | null;
  declare signingSecretHash: string | null;
}

NotionWebhookRegistrationModel.init(
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
    notionWorkspaceId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    tokenHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    signingSecretHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
  },
  {
    sequelize: connectorsSequelize,
    modelName: "notion_webhook_registrations",
    indexes: [{ fields: ["notionWorkspaceId"], unique: true }],
  }
);
