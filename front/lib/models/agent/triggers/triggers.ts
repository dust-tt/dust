import type { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { WebhookSourcesViewModel } from "@app/lib/models/agent/triggers/webhook_sources_view";
import { frontSequelize } from "@app/lib/resources/storage";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
} from "@app/lib/resources/storage/data_types";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type {
  TriggerConfigurationType,
  TriggerExecutionMode,
  TriggerKind,
  TriggerOrigin,
  TriggerStatus,
} from "@app/types/assistant/triggers";
import {
  isValidTriggerKind,
  isValidTriggerStatus,
} from "@app/types/assistant/triggers";
import type { CreationOptional, ForeignKey } from "sequelize";

export class TriggerModel extends WorkspaceAwareModel<TriggerModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare customPrompt: string | null;
  declare status: TriggerStatus;

  declare kind: TriggerKind;
  declare configuration: TriggerConfigurationType;
  declare naturalLanguageDescription: string | null;
  declare origin: TriggerOrigin;

  /**
   * Webhooks specifics
   */
  declare webhookSourceViewId: ForeignKey<WebhookSourcesViewModel["id"]> | null;
  declare executionPerDayLimitOverride: number | null;
  declare executionMode: TriggerExecutionMode;

  /**
   * We use the sId, because it's static between an agent versions,
   * whereas the id is dynamic and changes with each new agent version.
   */
  declare agentConfigurationId: ForeignKey<AgentConfigurationModel["sId"]>;
  declare editor: ForeignKey<UserModel["id"]>;

  /**
   * Pod (Project Space) the trigger's conversation is created in. Null means the
   * conversation is created in the default space, matching legacy behavior.
   */
  declare spaceId: ForeignKey<SpaceModel["id"]> | null;
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
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: true,
      defaultValue: null,
    },
    customPrompt: {
      type: DANGEROUSLY_UNBOUNDED_TEXT,
      allowNull: true,
      defaultValue: null,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    configuration: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    origin: {
      type: DataTypes.STRING,
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
    executionMode: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    spaceId: {
      type: DataTypes.BIGINT,
      allowNull: true,
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
        if (
          trigger.changed("status") &&
          !isValidTriggerStatus(trigger.status)
        ) {
          throw new Error(`Invalid trigger status: ${trigger.status}`);
        }
      },
    },
    indexes: [
      { fields: ["workspaceId", "agentConfigurationId", "name"] },
      { fields: ["workspaceId", "webhookSourceViewId"] },
      { fields: ["spaceId"], concurrently: true },
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

TriggerModel.belongsTo(SpaceModel, {
  as: "space",
  foreignKey: { name: "spaceId", allowNull: true },
  onDelete: "RESTRICT",
});
