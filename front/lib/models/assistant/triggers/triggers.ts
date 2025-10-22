import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import type { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { WebhookSourcesViewModel } from "@app/lib/models/assistant/triggers/webhook_sources_view";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  TriggerConfigurationType,
  TriggerKind,
} from "@app/types/assistant/triggers";
import { isValidTriggerKind } from "@app/types/assistant/triggers";

export class TriggerModel extends WorkspaceAwareModel<TriggerModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare customPrompt: string | null;
  declare enabled: CreationOptional<boolean>;

  declare kind: TriggerKind;
  declare configuration: TriggerConfigurationType;
  declare naturalLanguageDescription: string | null;

  /**
   * Webhooks specifics
   */
  declare webhookSourceViewId: ForeignKey<WebhookSourcesViewModel["id"]> | null;
  declare executionPerDayLimitOverride: number | null;

  /**
   * We use the sId, because it's static between an agent versions,
   * whereas the id is dynamic and changes with each new agent version.
   */
  declare agentConfigurationId: ForeignKey<AgentConfiguration["sId"]>;
  declare editor: ForeignKey<UserModel["id"]>;
}

TriggerModel.init(
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
    agentConfigurationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    kind: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    naturalLanguageDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    customPrompt: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    configuration: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    webhookSourceViewId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    executionPerDayLimitOverride: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "trigger",
    sequelize: frontSequelize,
    hooks: {
      beforeValidate: (trigger: TriggerModel) => {
        if (trigger.changed("kind") && !isValidTriggerKind(trigger.kind)) {
          throw new Error(`Invalid trigger kind: ${trigger.kind}`);
        }
      },
    },
    indexes: [
      { fields: ["workspaceId", "agentConfigurationId", "name"], unique: true },
      { fields: ["workspaceId", "webhookSourceViewId"] },
    ],
  }
);

TriggerModel.belongsTo(UserModel, {
  foreignKey: { name: "editor", allowNull: false },
});

TriggerModel.belongsTo(WebhookSourcesViewModel, {
  foreignKey: { name: "webhookSourceViewId", allowNull: true },
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
