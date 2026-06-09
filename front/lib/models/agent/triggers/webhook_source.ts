import { frontSequelize } from "@app/lib/resources/storage";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
} from "@app/lib/resources/storage/data_types";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  WebhookProvider,
  WebhookSourceSignatureAlgorithm,
} from "@app/types/triggers/webhooks";
import type { CreationOptional } from "sequelize";

export class WebhookSourceModel extends WorkspaceAwareModel<WebhookSourceModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;

  declare secret: string | null;
  declare urlSecret: string;
  declare signatureHeader: string | null;
  declare signatureAlgorithm: WebhookSourceSignatureAlgorithm | null;
  declare provider: WebhookProvider | null;
  declare subscribedEvents: string[];

  declare remoteMetadata: Record<string, unknown> | null;
  declare oauthConnectionId: string | null;
}

WebhookSourceModel.init(
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    secret: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: true,
    },
    urlSecret: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: false,
    },
    signatureHeader: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    signatureAlgorithm: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    subscribedEvents: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
    },
    remoteMetadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    oauthConnectionId: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: true,
    },
  },
  {
    modelName: "webhook_source",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["workspaceId", "name"],
        unique: true,
      },
    ],
  }
);
