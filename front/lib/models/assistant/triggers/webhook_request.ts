import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

import { WebhookSourceModel } from "./webhook_source";

// Single source of truth for webhook request statuses
export const WEBHOOK_REQUEST_STATUSES = [
  "received",
  "processed",
  "failed",
] as const;

export type WebhookRequestStatus = (typeof WEBHOOK_REQUEST_STATUSES)[number];

/**
 * Webhook request model tracks the requests made by a webhook source.
 * It's used to track the status of the request handling and the error message if processing failed.
 */
export class WebhookRequestModel extends WorkspaceAwareModel<WebhookRequestModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare status: WebhookRequestStatus;
  declare webhookSourceId: ForeignKey<WebhookSourceModel["id"]>;
  declare webhookSource: WebhookSourceModel;

  // Processing data
  declare processedAt: Date | null;
  declare errorMessage: string | null;
}

WebhookRequestModel.init(
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
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "received",
    },
    webhookSourceId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: WebhookSourceModel.tableName,
        key: "id",
      },
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    modelName: "webhook_request",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "webhookSourceId", "status"],
      },
    ],
  }
);

// Define the relationship
WebhookRequestModel.belongsTo(WebhookSourceModel, {
  foreignKey: "webhookSourceId",
  as: "webhookSource",
});
