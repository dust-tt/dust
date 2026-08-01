import type { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionItemModel } from "@app/lib/models/agent/agent_message_consumption_item";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import assert from "assert";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";
import { Op } from "sequelize";

type ConsumptionItemEvidenceBase = {
  grossAttributedCreditAmountMicro: number;
};

export type CompletedToolConsumptionItem = ConsumptionItemEvidenceBase & {
  itemType: "tool";
  runUsageModelId: ModelId | null;
  action: AgentMCPActionResource;
  /** Estimated tokens in the result returned by this tool execution */
  inputTokensCount: number | null;
  /** Estimated tokens in the model output that emitted the tool name and arguments */
  outputTokensCount: number | null;
  directCreditAmountMicro: number | null;
};

export type PendingToolConsumptionItem = ConsumptionItemEvidenceBase & {
  action: AgentMCPActionResource;
  runUsageModelId: ModelId | null;
  /** Estimated tokens in the model output that emitted the tool name and arguments */
  outputTokensCount: number | null;
};

type CompletedRunInputConsumptionItem = ConsumptionItemEvidenceBase & {
  itemType: "system" | "input";
  runUsageModelId: ModelId;
  inputTokensCount: number | null;
};

type CompletedRunOutputConsumptionItem = ConsumptionItemEvidenceBase & {
  itemType: "output" | "reasoning";
  runUsageModelId: ModelId;
  outputTokensCount: number | null;
};

export type CompletedAgentMessageConsumptionItem =
  | CompletedRunInputConsumptionItem
  | CompletedRunOutputConsumptionItem
  | CompletedToolConsumptionItem;

type ConsumptionItemEvidenceAttributes = Pick<
  Attributes<AgentMessageConsumptionItemModel>,
  | "inputTokensCount"
  | "outputTokensCount"
  | "grossAttributedCreditAmountMicro"
  | "directCreditAmountMicro"
>;

type ConsumptionItemCreationAttributes =
  CreationAttributes<AgentMessageConsumptionItemModel>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AgentMessageConsumptionItemResource
  extends ReadonlyAttributesType<AgentMessageConsumptionItemModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentMessageConsumptionItemResource extends BaseResource<AgentMessageConsumptionItemModel> {
  static model: ModelStaticWorkspaceAware<AgentMessageConsumptionItemModel> =
    AgentMessageConsumptionItemModel;

  constructor(
    model: ModelStaticWorkspaceAware<AgentMessageConsumptionItemModel>,
    blob: Attributes<AgentMessageConsumptionItemModel>
  ) {
    super(model, blob);
  }

  private static itemKey(record: CompletedAgentMessageConsumptionItem): string {
    switch (record.itemType) {
      case "system":
      case "input":
      case "output":
      case "reasoning":
        return `run-usage:${record.runUsageModelId}:${record.itemType}`;

      case "tool":
        return `tool-action:${record.action.id}`;

      default:
        return assertNever(record);
    }
  }

  private static evidenceAttributes(
    record: CompletedAgentMessageConsumptionItem
  ): ConsumptionItemEvidenceAttributes {
    switch (record.itemType) {
      case "system":
      case "input":
        return {
          inputTokensCount: record.inputTokensCount,
          outputTokensCount: null,
          grossAttributedCreditAmountMicro:
            record.grossAttributedCreditAmountMicro,
          directCreditAmountMicro: null,
        };

      case "output":
      case "reasoning":
        return {
          inputTokensCount: null,
          outputTokensCount: record.outputTokensCount,
          grossAttributedCreditAmountMicro:
            record.grossAttributedCreditAmountMicro,
          directCreditAmountMicro: null,
        };

      case "tool":
        return {
          inputTokensCount: record.inputTokensCount,
          outputTokensCount: record.outputTokensCount,
          grossAttributedCreditAmountMicro:
            record.grossAttributedCreditAmountMicro,
          directCreditAmountMicro: record.directCreditAmountMicro,
        };

      default:
        return assertNever(record);
    }
  }

  private static assertUniqueItemKeys(
    records: CompletedAgentMessageConsumptionItem[]
  ): void {
    const itemKeys = records.map((record) => this.itemKey(record));
    const uniqueItemKeys = new Set(itemKeys);
    assert(
      uniqueItemKeys.size === itemKeys.length,
      "Consumption items contain duplicate identities"
    );
  }

  private static creationAttributes(
    auth: Authenticator,
    {
      conversationModelId,
      agentMessageModelId,
      attributionVersion,
      record,
      now,
    }: {
      conversationModelId: ModelId;
      agentMessageModelId: ModelId;
      attributionVersion: number;
      record: CompletedAgentMessageConsumptionItem;
      now: Date;
    }
  ): ConsumptionItemCreationAttributes {
    return {
      ...this.evidenceAttributes(record),
      workspaceId: auth.getNonNullableWorkspace().id,
      conversationId: conversationModelId,
      agentMessageId: agentMessageModelId,
      runUsageId: record.runUsageModelId,
      agentMCPActionId: record.itemType === "tool" ? record.action.id : null,
      itemKey: this.itemKey(record),
      itemType: record.itemType,
      attributionVersion,
      completedAt: now,
    };
  }

  private static pendingToolCreationAttributes(
    auth: Authenticator,
    {
      conversationModelId,
      attributionVersion,
      item,
      now,
    }: {
      conversationModelId: ModelId;
      attributionVersion: number;
      item: PendingToolConsumptionItem;
      now: Date;
    }
  ): ConsumptionItemCreationAttributes {
    return {
      workspaceId: auth.getNonNullableWorkspace().id,
      conversationId: conversationModelId,
      agentMessageId: item.action.agentMessageId,
      runUsageId: item.runUsageModelId,
      agentMCPActionId: item.action.id,
      itemKey: `tool-action:${item.action.id}`,
      itemType: "tool",
      attributionVersion,
      inputTokensCount: null,
      outputTokensCount: item.outputTokensCount,
      grossAttributedCreditAmountMicro: item.grossAttributedCreditAmountMicro,
      directCreditAmountMicro: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Writes one message's attribution breakdown for a single pass, idempotently and atomically.
   * Callers pass the whole desired set and this reconciles it in one transaction, so the materializer
   * never coordinates a read then separate inserts and updates.
   *
   * Three write shapes, one per identity class:
   * - Model buckets and already-final tools with no prior row are inserted, first write wins, so a
   *   re-finalize with the same identity is a no-op.
   * - A final tool is upserted on its (message, version, itemKey) identity, so a row a previous pass
   *   left pending, because the tool was still blocked then, is completed in place here rather than
   *   skipped by the insert.
   * - A still-blocked tool is inserted pending and never overwrites an existing row, so a completed
   *   row from a concurrent pass is not regressed to pending.
   */
  static async recordItemsIdempotently(
    auth: Authenticator,
    {
      conversation,
      agentMessageModelId,
      attributionVersion,
      records,
      pendingToolItems,
      transaction,
    }: {
      conversation: ConversationResource;
      agentMessageModelId: ModelId;
      attributionVersion: number;
      records: CompletedAgentMessageConsumptionItem[];
      pendingToolItems: PendingToolConsumptionItem[];
      transaction?: Transaction;
    }
  ): Promise<void> {
    if (records.length === 0 && pendingToolItems.length === 0) {
      return;
    }

    this.assertUniqueItemKeys(records);
    assert(
      records.every(
        (record) =>
          record.itemType !== "tool" ||
          record.action.agentMessageId === agentMessageModelId
      ),
      "Tool consumption items must have the same agent message ID as the owning agent message"
    );
    assert(
      pendingToolItems.every(
        (item) => item.action.agentMessageId === agentMessageModelId
      ),
      "Pending tool consumption items must have the same agent message ID as the owning agent message"
    );

    const now = new Date();
    const modelRecords = records.filter((record) => record.itemType !== "tool");
    const completedToolRecords = records.filter(
      (record) => record.itemType === "tool"
    );

    await withTransaction(async (t) => {
      if (modelRecords.length > 0) {
        // Model buckets: first write wins, so a re-finalize does not disturb an existing breakdown.
        await this.model.bulkCreate(
          modelRecords.map((record) =>
            this.creationAttributes(auth, {
              conversationModelId: conversation.id,
              agentMessageModelId,
              attributionVersion,
              record,
              now,
            })
          ),
          {
            ignoreDuplicates: true,
            returning: false,
            transaction: t,
            // Sequelize disables validation by default for bulkCreate.
            validate: true,
          }
        );
      }

      if (completedToolRecords.length > 0) {
        // Final tools: insert the row, or complete one an earlier pass left pending, in a single
        // upsert on the message-version-itemKey identity. This is what lands an approved-after-pause
        // tool that the insert above would skip.
        await this.model.bulkCreate(
          completedToolRecords.map((record) =>
            this.creationAttributes(auth, {
              conversationModelId: conversation.id,
              agentMessageModelId,
              attributionVersion,
              record,
              now,
            })
          ),
          {
            updateOnDuplicate: [
              "runUsageId",
              "inputTokensCount",
              "outputTokensCount",
              "grossAttributedCreditAmountMicro",
              "directCreditAmountMicro",
              "completedAt",
              "updatedAt",
            ],
            conflictAttributes: [
              "workspaceId",
              "agentMessageId",
              "attributionVersion",
              "itemKey",
            ],
            returning: false,
            transaction: t,
            validate: true,
          }
        );
      }

      if (pendingToolItems.length > 0) {
        // Blocked tools: record the pending row only if none exists, never overwriting a completed
        // one, so a racing final pass keeps precedence.
        await this.model.bulkCreate(
          pendingToolItems.map((item) =>
            this.pendingToolCreationAttributes(auth, {
              conversationModelId: conversation.id,
              attributionVersion,
              item,
              now,
            })
          ),
          {
            ignoreDuplicates: true,
            returning: false,
            transaction: t,
            validate: true,
          }
        );
      }
    }, transaction);
  }

  static async listByAgentMessageModelIds(
    auth: Authenticator,
    {
      agentMessageModelIds,
      attributionVersion,
      transaction,
    }: {
      agentMessageModelIds: ModelId[];
      attributionVersion: number;
      transaction?: Transaction;
    }
  ): Promise<AgentMessageConsumptionItemResource[]> {
    if (agentMessageModelIds.length === 0) {
      return [];
    }

    const items = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentMessageId: { [Op.in]: agentMessageModelIds },
        attributionVersion,
      },
      order: [
        ["agentMessageId", "ASC"],
        ["id", "ASC"],
      ],
      transaction,
    });

    return items.map((item) => new this(this.model, item.get()));
  }

  static async deleteByAgentMessageModelIds(
    auth: Authenticator,
    {
      agentMessageModelIds,
      transaction,
    }: {
      agentMessageModelIds: ModelId[];
      transaction?: Transaction;
    }
  ): Promise<number> {
    if (agentMessageModelIds.length === 0) {
      return 0;
    }

    return this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentMessageId: { [Op.in]: agentMessageModelIds },
      },
      transaction,
    });
  }

  async delete(): Promise<Result<undefined, Error>> {
    return new Err(
      new Error(
        "Consumption items can only be deleted with their owning agent message"
      )
    );
  }
}
