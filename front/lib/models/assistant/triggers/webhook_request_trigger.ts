import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

import { TriggerModel } from "./triggers";
import { WebhookRequestModel } from "./webhook_request";

// Single source of truth for webhook request trigger statuses
export const WEBHOOK_REQUEST_TRIGGER_STATUSES = [
  "workflow_start_succeeded",
  "workflow_start_failed",
  "not_matched",
  "rate_limited",
] as const;

export type WebhookRequestTriggerStatus =
  (typeof WEBHOOK_REQUEST_TRIGGER_STATUSES)[number];

/**
 * WebhookRequestTrigger model maps webhook requests to triggers.
 * It tracks the execution state of each trigger for a given webhook request.
 */
export class WebhookRequestTriggerModel extends WorkspaceAwareModel<WebhookRequestTriggerModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare status: WebhookRequestTriggerStatus;
  declare webhookRequestId: ForeignKey<WebhookRequestModel["id"]>;
  declare triggerId: ForeignKey<TriggerModel["id"]>;

  // Relationships
  declare webhookRequest: NonAttribute<WebhookRequestModel>;
  declare trigger: NonAttribute<TriggerModel>;
}

WebhookRequestTriggerModel.init(
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
      defaultValue: "not_matched",
    },
    webhookRequestId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: WebhookRequestModel.tableName,
        key: "id",
      },
    },
    triggerId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: TriggerModel.tableName,
        key: "id",
      },
    },
  },
  {
    modelName: "webhook_request_trigger",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "webhookRequestId", "status"],
      },
      {
        fields: ["workspaceId", "triggerId", "status"],
      },
      {
        fields: ["webhookRequestId", "triggerId"],
        unique: true,
      },
    ],
  }
);

// Define relationships
WebhookRequestTriggerModel.belongsTo(WebhookRequestModel, {
  foreignKey: "webhookRequestId",
  as: "webhookRequest",
});

WebhookRequestTriggerModel.belongsTo(TriggerModel, {
  foreignKey: "triggerId",
  as: "trigger",
});
