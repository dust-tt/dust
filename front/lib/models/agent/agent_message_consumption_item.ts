import {
  AgentMessageModel,
  ConversationModel,
} from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { AgentMessageConsumptionItemType } from "@app/types/assistant/agent_message_consumption";
import { AGENT_MESSAGE_CONSUMPTION_ITEM_TYPES } from "@app/types/assistant/agent_message_consumption";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { CreationOptional, ForeignKey } from "sequelize";
import { Op } from "sequelize";

function validateConsumptionItemShape(
  this: AgentMessageConsumptionItemModel
): void {
  const isTool = this.itemType === "tool";

  if (isTool && this.agentMCPActionId === null) {
    throw new Error("Tool attribution items require an agent MCP action");
  }
  if (!isTool && this.agentMCPActionId !== null) {
    throw new Error("Only tool attribution items may reference an action");
  }
  if (!isTool && this.directCreditAmountMicro !== null) {
    throw new Error("Only tool attribution items may contain direct credits");
  }
  if (!isTool && this.completedAt === null) {
    throw new Error("Only tool attribution items may be pending");
  }
  if (
    isTool &&
    this.completedAt === null &&
    (this.inputTokensCount !== null || this.directCreditAmountMicro !== null)
  ) {
    throw new Error(
      "Pending tool attribution items cannot contain result or direct credit evidence"
    );
  }
  if (
    this.directCreditAmountMicro !== null &&
    this.grossAttributedCreditAmountMicro < this.directCreditAmountMicro
  ) {
    throw new Error("Gross attributed credits cannot be below direct credits");
  }

  switch (this.itemType) {
    case "system":
    case "input":
      if (this.outputTokensCount !== null) {
        throw new Error(`${this.itemType} items cannot contain output tokens`);
      }
      break;

    case "output":
    case "reasoning":
      if (this.inputTokensCount !== null) {
        throw new Error(`${this.itemType} items cannot contain input tokens`);
      }
      break;

    case "tool":
      break;

    case "rounding":
      if (this.inputTokensCount !== null || this.outputTokensCount !== null) {
        throw new Error("Rounding items cannot contain tokens");
      }
      if (this.grossAttributedCreditAmountMicro !== 0) {
        throw new Error("Rounding items cannot contain gross credits");
      }
      break;

    default:
      assertNever(this.itemType);
  }
}

// Each row explains one component of an agent message's cost (a model token bucket or a tool call).
// `grossAttributedCreditAmountMicro` is cache-naive evidence and is not expected to sum to the
// bill. It is stable once complete except for one monotonic correction: terminal messages remove a
// final tool result that never reached another model run. `reconciledCreditAmountMicro`
// materializes the item's share of the authoritative Metronome AWU charge. It remains null until a
// complete attribution version can be allocated. See attribution_builder.ts and allocation.ts for
// the pricing and reconciliation rationale.
export class AgentMessageConsumptionItemModel extends WorkspaceAwareModel<AgentMessageConsumptionItemModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare conversationId: ForeignKey<ConversationModel["id"]>;
  declare agentMessageId: ForeignKey<AgentMessageModel["id"]>;
  declare runUsageId: ModelId;
  declare agentMCPActionId: ModelId | null;
  declare itemKey: string;
  declare itemType: AgentMessageConsumptionItemType;
  declare runKey: string | null;
  declare attributionVersion: number;
  declare inputTokensCount: number | null;
  declare outputTokensCount: number | null;
  declare grossAttributedCreditAmountMicro: number;
  declare reconciledCreditAmountMicro: number | null;
  declare directCreditAmountMicro: number | null;
  declare completedAt: Date | null;
}

AgentMessageConsumptionItemModel.init(
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
    conversationId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: ConversationModel,
        key: "id",
      },
    },
    agentMessageId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: AgentMessageModel,
        key: "id",
      },
    },
    runUsageId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    agentMCPActionId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    itemKey: {
      type: DataTypes.STRING(256),
      allowNull: false,
    },
    itemType: {
      type: DataTypes.STRING(32),
      allowNull: false,
      validate: {
        isIn: [AGENT_MESSAGE_CONSUMPTION_ITEM_TYPES],
      },
    },
    runKey: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    attributionVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 },
    },
    inputTokensCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 0 },
    },
    outputTokensCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 0 },
    },
    grossAttributedCreditAmountMicro: {
      type: DataTypes.BIGINT,
      allowNull: false,
      validate: { min: 0 },
    },
    reconciledCreditAmountMicro: {
      type: DataTypes.BIGINT,
      allowNull: true,
      validate: { min: 0 },
    },
    directCreditAmountMicro: {
      type: DataTypes.BIGINT,
      allowNull: true,
      validate: { min: 0 },
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize: frontSequelize,
    modelName: "agent_message_consumption_item",
    tableName: "agent_message_consumption_items",
    indexes: [
      {
        unique: true,
        concurrently: true,
        fields: [
          "workspaceId",
          "agentMessageId",
          "attributionVersion",
          "itemKey",
        ],
        name: "agent_message_consumption_items_message_version_key",
      },
      {
        concurrently: true,
        fields: ["workspaceId", "runKey"],
        name: "agent_message_consumption_items_workspace_run_key",
      },
      {
        concurrently: true,
        fields: ["conversationId"],
      },
      {
        concurrently: true,
        fields: ["agentMessageId"],
      },
      {
        unique: true,
        concurrently: true,
        fields: ["workspaceId", "attributionVersion", "agentMCPActionId"],
        where: { agentMCPActionId: { [Op.ne]: null } },
        name: "agent_message_consumption_items_unique_action",
      },
      {
        unique: true,
        concurrently: true,
        fields: [
          "workspaceId",
          "agentMessageId",
          "attributionVersion",
          "runKey",
        ],
        where: { itemType: "rounding" },
        name: "agent_message_consumption_items_unique_rounding",
      },
    ],
    validate: {
      validConsumptionItemShape: validateConsumptionItemShape,
    },
  }
);

ConversationModel.hasMany(AgentMessageConsumptionItemModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "RESTRICT",
});
AgentMessageConsumptionItemModel.belongsTo(ConversationModel, {
  foreignKey: { name: "conversationId", allowNull: false },
  onDelete: "RESTRICT",
});

AgentMessageModel.hasMany(AgentMessageConsumptionItemModel, {
  foreignKey: { name: "agentMessageId", allowNull: false },
  onDelete: "RESTRICT",
});
AgentMessageConsumptionItemModel.belongsTo(AgentMessageModel, {
  foreignKey: { name: "agentMessageId", allowNull: false },
  onDelete: "RESTRICT",
});
