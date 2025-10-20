import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { WebhookSourceModel } from "@app/lib/models/assistant/triggers/webhook_source";
import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { SoftDeletableWorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { WebhookSourceKind } from "@app/types/triggers/webhooks";

export class WebhookSourcesViewModel extends SoftDeletableWorkspaceAwareModel<WebhookSourcesViewModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Corresponds to the ID of the last user to add the webhook source to the space.
  declare editedByUserId: ForeignKey<UserModel["id"]> | null;
  declare editedAt: Date;

  declare webhookSourceId: ForeignKey<WebhookSourceModel["id"]>;

  declare customName: string | null;
  declare description: string;
  declare icon: string;
  declare kind: WebhookSourceKind;
  declare subscribedEvents: string[];

  declare vaultId: ForeignKey<SpaceModel["id"]>;

  declare editedByUser: NonAttribute<UserModel>;
  declare space: NonAttribute<SpaceModel>;
  declare webhookSource: NonAttribute<WebhookSourceModel>;
}

WebhookSourcesViewModel.init(
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
    deletedAt: {
      type: DataTypes.DATE,
    },
    editedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    customName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    icon: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    kind: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    subscribedEvents: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
    },
    webhookSourceId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: WebhookSourceModel,
        key: "id",
      },
    },
  },
  {
    modelName: "webhook_sources_view",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId", "vaultId"] },
      {
        fields: ["workspaceId", "vaultId", "webhookSourceId"],
        where: {
          deletedAt: null,
        },
        unique: true,
        name: "webhook_sources_views_workspace_webhook_source_vault_active",
      },
    ],
  }
);

SpaceModel.hasMany(WebhookSourcesViewModel, {
  foreignKey: { allowNull: false, name: "vaultId" },
  onDelete: "RESTRICT",
});
WebhookSourcesViewModel.belongsTo(SpaceModel, {
  foreignKey: { allowNull: false, name: "vaultId" },
});

WebhookSourceModel.hasMany(WebhookSourcesViewModel, {
  as: "webhookSource",
  foreignKey: { name: "webhookSourceId", allowNull: false },
  onDelete: "RESTRICT",
});
WebhookSourcesViewModel.belongsTo(WebhookSourceModel, {
  as: "webhookSource",
  foreignKey: { name: "webhookSourceId", allowNull: false },
});

WebhookSourcesViewModel.belongsTo(UserModel, {
  as: "editedByUser",
  foreignKey: { name: "editedByUserId", allowNull: true },
});
