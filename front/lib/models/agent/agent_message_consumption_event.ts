import type { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { CreationOptional } from "sequelize";

const AGENT_MESSAGE_STATUSES = [
  "created",
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
  "gracefully_stopped",
] as const satisfies readonly AgentMessageStatus[];

function validateConsumptionEventShape(
  this: AgentMessageConsumptionEventModel
): void {
  switch (this.kind) {
    case "items_changed":
      if (
        this.consumptionItemIds === null ||
        this.consumptionItemIds.length === 0 ||
        this.consumptionItemIds.some(
          (consumptionItemId) =>
            !Number.isSafeInteger(consumptionItemId) || consumptionItemId <= 0
        ) ||
        new Set(this.consumptionItemIds).size !== this.consumptionItemIds.length
      ) {
        throw new Error(
          "An items-changed event must reference unique consumption item IDs"
        );
      }
      if (this.status !== null || this.subagentAgentMessageId !== null) {
        throw new Error("An items-changed event cannot carry lifecycle data");
      }
      break;

    case "execution_started":
      if (
        this.consumptionItemIds !== null ||
        this.status !== null ||
        (this.subagentAgentMessageId !== null &&
          (!Number.isSafeInteger(this.subagentAgentMessageId) ||
            this.subagentAgentMessageId <= 0))
      ) {
        throw new Error("An execution-started event has invalid data");
      }
      break;

    case "execution_finalized":
      if (
        this.consumptionItemIds !== null ||
        this.status === null ||
        this.subagentAgentMessageId !== null
      ) {
        throw new Error("An execution-finalized event has invalid data");
      }
      break;

    default:
      assertNever(this.kind);
  }
}

export const CONSUMPTION_EVENT_KINDS = [
  "items_changed",
  "execution_started",
  "execution_finalized",
] as const;

export type ConsumptionEventKind = (typeof CONSUMPTION_EVENT_KINDS)[number];

export class AgentMessageConsumptionEventModel extends WorkspaceAwareModel<AgentMessageConsumptionEventModel> {
  declare createdAt: CreationOptional<Date>;
  declare processedAt: Date | null;
  declare updatedAt: CreationOptional<Date>;

  declare agentMessageId: ModelId;
  declare runKey: string;
  declare rootAgentMessageId: string;
  declare eventKey: string;
  declare kind: ConsumptionEventKind;
  declare consumptionItemIds: ModelId[] | null;
  declare status: AgentMessageStatus | null;
  declare subagentAgentMessageId: AgentMessageModel["id"] | null;
}

AgentMessageConsumptionEventModel.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    agentMessageId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    runKey: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    rootAgentMessageId: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    eventKey: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    kind: {
      type: DataTypes.STRING(32),
      allowNull: false,
      validate: { isIn: [CONSUMPTION_EVENT_KINDS] },
    },
    consumptionItemIds: {
      type: DataTypes.ARRAY(DataTypes.BIGINT),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: true,
      validate: { isIn: [AGENT_MESSAGE_STATUSES] },
    },
    subagentAgentMessageId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "agent_message_consumption_event",
    tableName: "agent_message_consumption_events",
    indexes: [
      {
        unique: true,
        concurrently: true,
        fields: ["workspaceId", "eventKey"],
        name: "agent_message_consumption_events_workspace_event_key",
      },
      {
        concurrently: true,
        fields: ["workspaceId", "runKey", "id"],
        where: { processedAt: null },
        name: "agent_message_consumption_events_pending_by_run_key",
      },
      {
        concurrently: true,
        fields: ["workspaceId", "agentMessageId", "id"],
        name: "agent_message_consumption_events_workspace_message_id",
      },
    ],
    validate: {
      validConsumptionEventShape: validateConsumptionEventShape,
    },
  }
);
