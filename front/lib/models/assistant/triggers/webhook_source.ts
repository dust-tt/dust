import type { CreationOptional } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  WebhookSourceKind,
  WebhookSourceSignatureAlgorithm,
} from "@app/types/triggers/webhooks";

export class WebhookSourceModel extends WorkspaceAwareModel<WebhookSourceModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;

  declare secret: string | null;
  declare urlSecret: string;
  declare signatureHeader: string | null;
  declare signatureAlgorithm: WebhookSourceSignatureAlgorithm | null;
  declare kind: WebhookSourceKind;
  declare subscribedEvents: string[];

  declare customHeaders: Record<string, string> | null;
  declare remoteMetadata: Record<string, any> | null;
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
      type: DataTypes.TEXT,
      allowNull: true,
    },
    urlSecret: {
      type: DataTypes.TEXT,
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
    kind: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    customHeaders: {
      type: DataTypes.JSONB,
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
      type: DataTypes.TEXT,
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
