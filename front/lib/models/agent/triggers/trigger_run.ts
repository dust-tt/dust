import type { ConversationModel } from "@app/lib/models/agent/conversation";
import type { TriggerModel } from "@app/lib/models/agent/triggers/triggers";
import { frontSequelize } from "@app/lib/resources/storage";
import type { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { TriggerRunStatus } from "@app/types/assistant/triggers";
import { isValidTriggerRunStatus } from "@app/types/assistant/triggers";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

export class TriggerRunModel extends WorkspaceAwareModel<TriggerRunModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare triggerId: ForeignKey<TriggerModel["id"]>;
  declare conversationId: ForeignKey<ConversationModel["id"]> | null;
  declare userId: ForeignKey<UserModel["id"]> | null;
  declare status: TriggerRunStatus;
  declare errorMessage: string | null;
  declare startedAt: Date;
  declare completedAt: Date | null;
}

TriggerRunModel.init(
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
    triggerId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: "triggers",
        key: "id",
      },
    },
    conversationId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: "conversations",
        key: "id",
      },
    },
    userId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "running",
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    modelName: "trigger_run",
    sequelize: frontSequelize,
    hooks: {
      beforeValidate: (triggerRun: TriggerRunModel) => {
        if (
          triggerRun.changed("status") &&
          !isValidTriggerRunStatus(triggerRun.status)
        ) {
          throw new Error(`Invalid trigger run status: ${triggerRun.status}`);
        }
      },
    },
    indexes: [
      { fields: ["workspaceId", "triggerId"] },
      { fields: ["workspaceId", "conversationId"] },
    ],
  }
);
