import { INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/consumption/version";
import { MAX_CONVERSATION_DEPTH } from "@app/lib/api/assistant/conversation/constants";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionItemModel } from "@app/lib/models/agent/agent_message_consumption_item";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  AgentMessageConsumptionItemType,
  AgentMessageConsumptionToolItemType,
} from "@app/types/assistant/agent_message_consumption";
import { isAgentMessageConsumptionToolItemType } from "@app/types/assistant/agent_message_consumption";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import assert from "assert";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";
import { Op, QueryTypes } from "sequelize";

export type ConversationConsumptionMessageFacts = {
  conversationId: string;
  agentConfigurationId: string;
  parentAgentConfigurationId: string | null;
  billedCredits: number | null;
  dustRunIds: string[];
  status: AgentMessageStatus;
  items: AgentMessageConsumptionItemResource[];
  actions: AgentMCPActionResource[];
};

type ConsumptionItemEvidenceBase = {
  grossAttributedCreditAmountMicro: number;
};

export type CompletedToolConsumptionItem = ConsumptionItemEvidenceBase & {
  itemType: "tool";
  runUsageModelId: ModelId;
  action: AgentMCPActionResource;
  /** Estimated tokens in the result returned by this tool execution */
  inputTokensCount: number | null;
  /** Estimated tokens in the model output that emitted the tool name and arguments */
  outputTokensCount: number | null;
  directCreditAmountMicro: number | null;
};

export type PendingToolConsumptionItem = ConsumptionItemEvidenceBase & {
  action: AgentMCPActionResource;
  runUsageModelId: ModelId;
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

type ConsumptionModelRowBase = {
  runUsageModelId: ModelId;
  inputTokensCount: number | null;
  outputTokensCount: number | null;
  grossAttributedCreditAmountMicro: number;
  reconciledCreditAmountMicro: number;
};

export type ConsumptionModelRow = ConsumptionModelRowBase & {
  itemType: "input" | "output" | "reasoning" | "rounding";
};

export type ConsumptionToolCallRow = {
  agentMCPActionModelId: ModelId;
  runUsageModelId: ModelId;
  outputTokensCount: number;
  grossAttributedCreditAmountMicro: number;
  reconciledCreditAmountMicro: number;
};

export type ConsumptionToolResultRow = {
  agentMCPActionModelId: ModelId;
  runUsageModelId: ModelId;
  inputTokensCount: number;
  grossAttributedCreditAmountMicro: number;
  reconciledCreditAmountMicro: number;
};

export type InsertedConsumptionRow = {
  consumptionItemId: ModelId;
  itemKey: string;
};

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

export interface AgentMessageModelConsumptionItemResource
  extends AgentMessageConsumptionItemResource {
  readonly itemType: Exclude<
    AgentMessageConsumptionItemType,
    AgentMessageConsumptionToolItemType | "rounding"
  >;
  readonly agentMCPActionId: null;
  readonly directCreditAmountMicro: null;
  readonly completedAt: Date;
}

export interface AgentMessageToolConsumptionItemResource
  extends AgentMessageConsumptionItemResource {
  readonly itemType: AgentMessageConsumptionToolItemType;
  readonly agentMCPActionId: ModelId;
}

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

  isModelItem(): this is AgentMessageModelConsumptionItemResource {
    switch (this.itemType) {
      case "system":
      case "input":
      case "output":
      case "reasoning":
        assert(
          this.agentMCPActionId === null &&
            this.directCreditAmountMicro === null &&
            this.completedAt !== null,
          "Model consumption item has invalid shape"
        );
        return true;

      case "rounding":
      case "tool":
      case "tool_call":
      case "tool_direct":
      case "tool_result":
      case "tool_adjustment":
        return false;

      default:
        return assertNever(this.itemType);
    }
  }

  isToolItem(): this is AgentMessageToolConsumptionItemResource {
    if (!isAgentMessageConsumptionToolItemType(this.itemType)) {
      return false;
    }

    assert(
      this.agentMCPActionId !== null,
      "Tool consumption item is missing its action"
    );
    return true;
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
   * Bulk-inserts final tools, then resolves conflicts by completing pending rows or removing a
   * terminal result footprint. The insert waits on concurrent writes to the unique action identity,
   * so the following lookup sees settled state without a separate lock.
   *
   * // TODO(2026-08-01 flav): Revisit based on how often it happens.
   * A resumed approval pass resubmits facts from earlier passes. PostgreSQL allocates sequence
   * values before detecting conflicts, so this can leave gaps in the primary key sequence. We
   * accept that tradeoff to keep this write race-safe without a pre-read. The agent loop resumes
   * only after every tool awaiting approval has been approved, so parallel approvals produce one
   * resumed pass rather than one pass per tool.
   */
  private static async insertOrCompleteToolRecords(
    auth: Authenticator,
    {
      conversationModelId,
      agentMessageModelId,
      attributionVersion,
      records,
      now,
      transaction,
    }: {
      conversationModelId: ModelId;
      agentMessageModelId: ModelId;
      attributionVersion: number;
      records: CompletedToolConsumptionItem[];
      now: Date;
      transaction: Transaction;
    }
  ): Promise<void> {
    const insertedRows = await this.model.bulkCreate(
      records.map((record) =>
        this.creationAttributes(auth, {
          conversationModelId,
          agentMessageModelId,
          attributionVersion,
          record,
          now,
        })
      ),
      {
        ignoreDuplicates: true,
        returning: ["id"],
        transaction,
        // Sequelize disables validation by default for bulkCreate.
        validate: true,
      }
    );

    // PostgreSQL returns an ID only for rows inserted by ON CONFLICT DO NOTHING. Most passes create
    // final tools directly, so they finish without the conflict lookup below.
    if (insertedRows.every((row) => Boolean(row.id))) {
      return;
    }

    const recordByActionModelId = new Map(
      records.map((record) => [record.action.id, record])
    );
    const existingRows = await this.model.findAll({
      attributes: [
        "id",
        "agentMCPActionId",
        "completedAt",
        "directCreditAmountMicro",
        "inputTokensCount",
        "outputTokensCount",
      ],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentMessageId: agentMessageModelId,
        attributionVersion,
        agentMCPActionId: { [Op.in]: [...recordByActionModelId.keys()] },
        itemType: "tool",
      },
      transaction,
    });

    for (const existingRow of existingRows) {
      const actionModelId = existingRow.agentMCPActionId;
      assert(
        actionModelId !== null,
        "An existing tool row must reference an action"
      );
      const record = recordByActionModelId.get(actionModelId);
      assert(
        record,
        "An existing tool row must have matching completion evidence"
      );

      if (existingRow.completedAt === null) {
        await this.model.update(
          {
            itemType: "tool",
            agentMCPActionId: actionModelId,
            inputTokensCount: record.inputTokensCount,
            grossAttributedCreditAmountMicro:
              record.grossAttributedCreditAmountMicro,
            directCreditAmountMicro: record.directCreditAmountMicro,
            completedAt: now,
          },
          {
            where: {
              id: existingRow.id,
              workspaceId: auth.getNonNullableWorkspace().id,
              agentMessageId: agentMessageModelId,
              attributionVersion,
              itemType: "tool",
              completedAt: { [Op.is]: null },
            },
            transaction,
          }
        );
        continue;
      }

      // A terminal pass may prove that a potential result never reached another model run. Permit
      // only that one-way correction. Stale non-terminal passes cannot restore the footprint.
      if (
        record.inputTokensCount === 0 &&
        (existingRow.inputTokensCount ?? 0) > 0
      ) {
        assert(
          existingRow.outputTokensCount === record.outputTokensCount &&
            existingRow.directCreditAmountMicro ===
              record.directCreditAmountMicro,
          "Removing a tool result cannot change its call or direct-charge evidence"
        );
        await this.model.update(
          {
            itemType: "tool",
            agentMCPActionId: actionModelId,
            inputTokensCount: 0,
            outputTokensCount: record.outputTokensCount,
            grossAttributedCreditAmountMicro:
              record.grossAttributedCreditAmountMicro,
            directCreditAmountMicro: record.directCreditAmountMicro,
          },
          {
            where: {
              id: existingRow.id,
              workspaceId: auth.getNonNullableWorkspace().id,
              agentMessageId: agentMessageModelId,
              attributionVersion,
              itemType: "tool",
              completedAt: { [Op.ne]: null },
              inputTokensCount: { [Op.gt]: 0 },
            },
            transaction,
          }
        );
      }
    }
  }

  /**
   * Writes one message's attribution breakdown for a single pass, idempotently and atomically.
   * Callers pass the whole desired set and this reconciles it in one transaction, so the materializer
   * never coordinates a read then separate inserts and updates.
   *
   * Four write shapes, one per lifecycle state:
   * - Model buckets and already-final tools with no prior row are inserted.
   * - A final tool is upserted on its (message, version, itemKey) identity only while the existing
   *   row is pending. This completes an approval-spanning tool without changing a completed fact.
   * - A terminal pass may remove a completed tool's result footprint. This transition is one-way.
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
        await this.insertOrCompleteToolRecords(auth, {
          conversationModelId: conversation.id,
          agentMessageModelId,
          attributionVersion,
          records: completedToolRecords,
          now,
          transaction: t,
        });
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
            // Sequelize disables validation by default for bulkCreate.
            validate: true,
          }
        );
      }
    }, transaction);
  }

  static async insertConsumptionRows(
    auth: Authenticator,
    {
      conversationModelId,
      agentMessageModelId,
      runKey,
      modelRows,
      toolCallRows,
      toolResultRows,
      transaction,
    }: {
      conversationModelId: ModelId;
      agentMessageModelId: ModelId;
      runKey: string;
      modelRows: ConsumptionModelRow[];
      toolCallRows: ConsumptionToolCallRow[];
      toolResultRows: ConsumptionToolResultRow[];
      transaction?: Transaction;
    }
  ): Promise<InsertedConsumptionRow[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const now = new Date();

    const rows: ConsumptionItemCreationAttributes[] = [
      ...modelRows.map((row) => ({
        workspaceId,
        conversationId: conversationModelId,
        agentMessageId: agentMessageModelId,
        runUsageId: row.runUsageModelId,
        agentMCPActionId: null,
        itemKey:
          row.itemType === "rounding"
            ? `rounding:${runKey}`
            : `run-usage:${row.runUsageModelId}:${row.itemType}`,
        itemType: row.itemType,
        runKey,
        attributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
        inputTokensCount: row.inputTokensCount,
        outputTokensCount: row.outputTokensCount,
        grossAttributedCreditAmountMicro: row.grossAttributedCreditAmountMicro,
        reconciledCreditAmountMicro: row.reconciledCreditAmountMicro,
        directCreditAmountMicro: null,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      })),
      ...toolCallRows.map((row) => ({
        workspaceId,
        conversationId: conversationModelId,
        agentMessageId: agentMessageModelId,
        runUsageId: row.runUsageModelId,
        agentMCPActionId: row.agentMCPActionModelId,
        itemKey: `tool-action:${row.agentMCPActionModelId}:call`,
        itemType: "tool_call" as const,
        runKey,
        attributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
        inputTokensCount: null,
        outputTokensCount: row.outputTokensCount,
        grossAttributedCreditAmountMicro: row.grossAttributedCreditAmountMicro,
        reconciledCreditAmountMicro: row.reconciledCreditAmountMicro,
        directCreditAmountMicro: null,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      })),
      ...toolResultRows.map((row) => ({
        workspaceId,
        conversationId: conversationModelId,
        agentMessageId: agentMessageModelId,
        runUsageId: row.runUsageModelId,
        agentMCPActionId: row.agentMCPActionModelId,
        itemKey: `tool-action:${row.agentMCPActionModelId}:result`,
        itemType: "tool_result" as const,
        runKey,
        attributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
        inputTokensCount: row.inputTokensCount,
        outputTokensCount: null,
        grossAttributedCreditAmountMicro: row.grossAttributedCreditAmountMicro,
        reconciledCreditAmountMicro: row.reconciledCreditAmountMicro,
        directCreditAmountMicro: null,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      })),
    ];
    if (rows.length === 0) {
      return [];
    }

    const insertedRows = await this.model.bulkCreate(rows, {
      ignoreDuplicates: true,
      returning: ["id", "itemKey"],
      transaction,
      validate: true,
    });

    return insertedRows
      .filter((row) => Boolean(row.id))
      .map((row) => ({ consumptionItemId: row.id, itemKey: row.itemKey }));
  }

  static async addReconciledCreditAmounts(
    auth: Authenticator,
    {
      creditAmountMicroDeltaByConsumptionItemId,
      transaction,
    }: {
      creditAmountMicroDeltaByConsumptionItemId: ReadonlyMap<ModelId, number>;
      transaction?: Transaction;
    }
  ): Promise<void> {
    const deltas = [...creditAmountMicroDeltaByConsumptionItemId].filter(
      ([, creditAmountMicroDelta]) => creditAmountMicroDelta !== 0
    );
    if (deltas.length === 0) {
      return;
    }

    // biome-ignore lint/plugin/noRawSql: Sequelize cannot bulk-update each row with a distinct value.
    await frontSequelize.query(
      `
        UPDATE agent_message_consumption_items AS item
        SET
          "reconciledCreditAmountMicro" =
            COALESCE(item."reconciledCreditAmountMicro", 0) + delta.credit_amount_micro,
          "updatedAt" = $updatedAt
        FROM unnest(
          $consumptionItemIds::bigint[],
          $creditAmountsMicro::bigint[]
        ) AS delta(consumption_item_id, credit_amount_micro)
        WHERE item.id = delta.consumption_item_id
          AND item."workspaceId" = $workspaceModelId
      `,
      {
        bind: {
          consumptionItemIds: deltas.map(
            ([consumptionItemId]) => consumptionItemId
          ),
          creditAmountsMicro: deltas.map(
            ([, creditAmountMicroDelta]) => creditAmountMicroDelta
          ),
          updatedAt: new Date(),
          workspaceModelId: auth.getNonNullableWorkspace().id,
        },
        transaction,
        type: QueryTypes.UPDATE,
      }
    );
  }

  static async fetchConsumptionToolCallRow(
    auth: Authenticator,
    {
      agentMCPActionModelId,
      transaction,
    }: {
      agentMCPActionModelId: ModelId;
      transaction?: Transaction;
    }
  ): Promise<AgentMessageToolConsumptionItemResource | null> {
    const row = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        attributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
        agentMCPActionId: agentMCPActionModelId,
        itemType: "tool_call",
      },
      transaction,
    });
    if (!row) {
      return null;
    }

    const item = new this(this.model, row.get());
    return item.isToolItem() ? item : null;
  }

  static async sumConsumptionCreditAmountMicroByRunKeyForAgentMessages(
    auth: Authenticator,
    { agentMessageModelIds }: { agentMessageModelIds: ModelId[] }
  ): Promise<Map<string, number>> {
    if (agentMessageModelIds.length === 0) {
      return new Map();
    }

    // biome-ignore lint/plugin/noRawSql: Sequelize does not safely type a grouped coalesced sum.
    const rows = await frontSequelize.query<{
      runKey: string;
      total: string;
    }>(
      `
        SELECT
          "runKey",
          SUM(COALESCE(
            "reconciledCreditAmountMicro",
            "grossAttributedCreditAmountMicro"
          ))::text AS total
        FROM agent_message_consumption_items
        WHERE "workspaceId" = $workspaceModelId
          AND "agentMessageId" = ANY($agentMessageModelIds::bigint[])
          AND "attributionVersion" = $attributionVersion
          AND "runKey" IS NOT NULL
        GROUP BY "runKey"
      `,
      {
        bind: {
          agentMessageModelIds,
          attributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
          workspaceModelId: auth.getNonNullableWorkspace().id,
        },
        type: QueryTypes.SELECT,
      }
    );

    return new Map(
      rows.map((row) => {
        const total = Number(row.total);
        assert(
          Number.isSafeInteger(total) && total >= 0,
          "Consumption execution total is outside the supported integer range"
        );
        return [row.runKey, total];
      })
    );
  }

  static async listConsumptionRowsByRunKey(
    auth: Authenticator,
    {
      runKey,
      transaction,
    }: {
      runKey: string;
      transaction?: Transaction;
    }
  ): Promise<AgentMessageConsumptionItemResource[]> {
    const rows = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        attributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
        runKey,
      },
      order: [["id", "ASC"]],
      transaction,
    });

    return rows.map((row) => new this(this.model, row.get()));
  }

  static async listConsumptionRowsByAgentMessage(
    auth: Authenticator,
    {
      agentMessageModelId,
      lockForUpdate = false,
      transaction,
    }: {
      agentMessageModelId: ModelId;
      lockForUpdate?: boolean;
      transaction?: Transaction;
    }
  ): Promise<AgentMessageConsumptionItemResource[]> {
    const rows = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        attributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
        agentMessageId: agentMessageModelId,
      },
      order: [["id", "ASC"]],
      ...(lockForUpdate && transaction
        ? { lock: transaction.LOCK.UPDATE }
        : {}),
      transaction,
    });

    return rows.map((row) => new this(this.model, row.get()));
  }

  static async sumConsumptionBilledCreditAmountMicro(
    auth: Authenticator,
    {
      agentMessageModelId,
      transaction,
    }: {
      agentMessageModelId: ModelId;
      transaction?: Transaction;
    }
  ): Promise<number> {
    // biome-ignore lint/plugin/noRawSql: Sequelize cannot express a grouped HAVING over a filter.
    const rows = await frontSequelize.query<{ total: string | null }>(
      `
        SELECT COALESCE(SUM(execution.total), 0) AS total
        FROM (
          SELECT SUM("reconciledCreditAmountMicro") AS total
          FROM agent_message_consumption_items
          WHERE "workspaceId" = $workspaceModelId
            AND "agentMessageId" = $agentMessageModelId
            AND "attributionVersion" = $attributionVersion
            AND "runKey" IS NOT NULL
          GROUP BY "runKey"
          HAVING COUNT(*) FILTER (WHERE "itemType" = 'rounding') > 0
        ) AS execution
      `,
      {
        bind: {
          agentMessageModelId,
          attributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
          workspaceModelId: auth.getNonNullableWorkspace().id,
        },
        transaction,
        type: QueryTypes.SELECT,
      }
    );

    return Number(rows[0]?.total ?? 0);
  }

  static async insertConsumptionToolDirectRow(
    auth: Authenticator,
    {
      agentMCPActionModelId,
      agentMessageModelId,
      chargeAmountMicro,
      conversationModelId,
      inputTokensCount,
      runKey,
      runUsageModelId,
      transaction,
    }: {
      agentMCPActionModelId: ModelId;
      agentMessageModelId: ModelId;
      chargeAmountMicro: number;
      conversationModelId: ModelId;
      inputTokensCount: number;
      runKey: string;
      runUsageModelId: ModelId;
      transaction?: Transaction;
    }
  ): Promise<InsertedConsumptionRow | null> {
    const now = new Date();
    const [row] = await this.model.bulkCreate(
      [
        {
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId: conversationModelId,
          agentMessageId: agentMessageModelId,
          runUsageId: runUsageModelId,
          agentMCPActionId: agentMCPActionModelId,
          itemKey: `tool-action:${agentMCPActionModelId}:direct`,
          itemType: "tool_direct",
          runKey,
          attributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
          inputTokensCount,
          outputTokensCount: null,
          grossAttributedCreditAmountMicro: chargeAmountMicro,
          reconciledCreditAmountMicro: chargeAmountMicro,
          directCreditAmountMicro: chargeAmountMicro,
          completedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
      {
        ignoreDuplicates: true,
        returning: ["id", "itemKey"],
        transaction,
        validate: true,
      }
    );

    return row?.id ? { consumptionItemId: row.id, itemKey: row.itemKey } : null;
  }

  static async insertConsumptionToolAdjustmentRows(
    auth: Authenticator,
    {
      adjustments,
      transaction,
    }: {
      adjustments: {
        agentMCPActionModelId: ModelId;
        agentMessageModelId: ModelId;
        amountMicro: number;
        conversationModelId: ModelId;
        runKey: string;
        runUsageModelId: ModelId;
      }[];
      transaction?: Transaction;
    }
  ): Promise<InsertedConsumptionRow[]> {
    const nonZeroAdjustments = adjustments.filter(
      (adjustment) => adjustment.amountMicro !== 0
    );
    if (nonZeroAdjustments.length === 0) {
      return [];
    }

    const now = new Date();
    const rows = await this.model.bulkCreate(
      nonZeroAdjustments.map((adjustment) => ({
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: adjustment.conversationModelId,
        agentMessageId: adjustment.agentMessageModelId,
        runUsageId: adjustment.runUsageModelId,
        agentMCPActionId: adjustment.agentMCPActionModelId,
        itemKey: `tool-action:${adjustment.agentMCPActionModelId}:adjustment`,
        itemType: "tool_adjustment" as const,
        runKey: adjustment.runKey,
        attributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
        inputTokensCount: null,
        outputTokensCount: null,
        grossAttributedCreditAmountMicro: 0,
        reconciledCreditAmountMicro: adjustment.amountMicro,
        directCreditAmountMicro: adjustment.amountMicro,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      })),
      {
        ignoreDuplicates: true,
        returning: ["id", "itemKey"],
        transaction,
        validate: true,
      }
    );

    return rows
      .filter((row) => Boolean(row.id))
      .map((row) => ({ consumptionItemId: row.id, itemKey: row.itemKey }));
  }

  static async listConsumptionChargedToolRows(
    auth: Authenticator,
    {
      agentMessageModelId,
      transaction,
    }: {
      agentMessageModelId: ModelId;
      transaction?: Transaction;
    }
  ): Promise<AgentMessageToolConsumptionItemResource[]> {
    const rows = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentMessageId: agentMessageModelId,
        attributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
        itemType: "tool_direct",
        directCreditAmountMicro: { [Op.gt]: 0 },
      },
      order: [["completedAt", "ASC"]],
      transaction,
    });

    return rows.flatMap((row) => {
      const item = new this(this.model, row.get());
      return item.isToolItem() ? [item] : [];
    });
  }

  static async fetchConsumptionToolDirectRow(
    auth: Authenticator,
    {
      agentMCPActionModelId,
      transaction,
    }: {
      agentMCPActionModelId: ModelId;
      transaction?: Transaction;
    }
  ): Promise<AgentMessageToolConsumptionItemResource | null> {
    const row = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        attributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
        agentMCPActionId: agentMCPActionModelId,
        itemType: "tool_direct",
      },
      transaction,
    });
    if (!row) {
      return null;
    }

    const item = new this(this.model, row.get());
    return item.isToolItem() ? item : null;
  }

  static async listConsumptionToolResultsPendingConsumption(
    auth: Authenticator,
    {
      agentMessageModelId,
      transaction,
    }: {
      agentMessageModelId: ModelId;
      transaction: Transaction;
    }
  ): Promise<AgentMessageToolConsumptionItemResource[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const toolRows = await this.model.findAll({
      where: {
        workspaceId,
        agentMessageId: agentMessageModelId,
        attributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
        itemType: "tool_direct",
        inputTokensCount: { [Op.gt]: 0 },
      },
      lock: transaction.LOCK.UPDATE,
      order: [["id", "ASC"]],
      transaction,
    });
    if (toolRows.length === 0) {
      return [];
    }

    const actionModelIds = toolRows.flatMap((row) =>
      row.agentMCPActionId === null ? [] : [row.agentMCPActionId]
    );
    const resultRows = await this.model.findAll({
      attributes: ["agentMCPActionId"],
      where: {
        workspaceId,
        agentMessageId: agentMessageModelId,
        attributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
        itemType: "tool_result",
        agentMCPActionId: { [Op.in]: actionModelIds },
      },
      transaction,
    });
    const consumedActionModelIds = resultRows.flatMap((row) =>
      row.agentMCPActionId === null ? [] : [row.agentMCPActionId]
    );
    const consumedActionModelIdSet = new Set(consumedActionModelIds);

    return toolRows.flatMap((row) => {
      if (
        row.agentMCPActionId === null ||
        consumedActionModelIdSet.has(row.agentMCPActionId)
      ) {
        return [];
      }
      const item = new this(this.model, row.get());
      return item.isToolItem() ? [item] : [];
    });
  }

  static async setReconciledCreditAmounts(
    auth: Authenticator,
    {
      reconciledCreditAmountByItem,
      transaction,
    }: {
      reconciledCreditAmountByItem: ReadonlyMap<
        AgentMessageConsumptionItemResource,
        number
      >;
      transaction?: Transaction;
    }
  ): Promise<void> {
    const changedAllocations = [...reconciledCreditAmountByItem].filter(
      ([item, reconciledCreditAmountMicro]) =>
        item.reconciledCreditAmountMicro !== reconciledCreditAmountMicro
    );
    if (changedAllocations.length === 0) {
      return;
    }

    // biome-ignore lint/plugin/noRawSql: Sequelize cannot bulk-update each row with a distinct value.
    await frontSequelize.query(
      `
        UPDATE agent_message_consumption_items AS item
        SET
          "reconciledCreditAmountMicro" = allocation.reconciled_credit_amount_micro,
          "updatedAt" = $updatedAt
        FROM unnest(
          $consumptionItemIds::bigint[],
          $reconciledCreditAmountsMicro::bigint[]
        ) AS allocation(consumption_item_id, reconciled_credit_amount_micro)
        WHERE item.id = allocation.consumption_item_id
          AND item."workspaceId" = $workspaceModelId
      `,
      {
        bind: {
          consumptionItemIds: changedAllocations.map(([item]) => item.id),
          reconciledCreditAmountsMicro: changedAllocations.map(
            ([, reconciledCreditAmountMicro]) => reconciledCreditAmountMicro
          ),
          updatedAt: new Date(),
          workspaceModelId: auth.getNonNullableWorkspace().id,
        },
        transaction,
        type: QueryTypes.UPDATE,
      }
    );
  }

  static async listByAgentMessageModelIds(
    auth: Authenticator,
    {
      agentMessageModelIds,
      maxAttributionVersion,
      transaction,
    }: {
      agentMessageModelIds: ModelId[];
      maxAttributionVersion: number;
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
        attributionVersion: { [Op.lte]: maxAttributionVersion },
      },
      order: [
        ["agentMessageId", "ASC"],
        ["id", "ASC"],
      ],
      transaction,
    });

    return items.map((item) => new this(this.model, item.get()));
  }

  static async sumConsumptionCreditAmountMicroByRunKey(
    auth: Authenticator,
    { runKey }: { runKey: string }
  ): Promise<number> {
    // biome-ignore lint/plugin/noRawSql: Sequelize cannot express SUM(COALESCE(column, column)).
    const [row] = await frontSequelize.query<{ total: string }>(
      `
        SELECT COALESCE(
          SUM(COALESCE(
            "reconciledCreditAmountMicro",
            "grossAttributedCreditAmountMicro"
          )),
          0
        )::text AS total
        FROM agent_message_consumption_items
        WHERE "workspaceId" = $workspaceModelId
          AND "runKey" = $runKey
          AND "attributionVersion" = $attributionVersion
      `,
      {
        bind: {
          attributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
          runKey,
          workspaceModelId: auth.getNonNullableWorkspace().id,
        },
        type: QueryTypes.SELECT,
      }
    );
    const total = Number(row?.total ?? 0);
    assert(
      Number.isSafeInteger(total) && total >= 0,
      "Consumption total is outside the supported integer range"
    );
    return total;
  }

  /**
   * Fetches every agent message and persisted attribution fact belonging to a
   * user-visible conversation or one of its recursively spawned `run_agent`
   * conversations. Superseded and deleted message versions are retained because
   * any execution that ran remains part of the conversation's bill.
   */
  static async fetchConversationConsumptionFacts(
    auth: Authenticator,
    {
      conversation,
      maxAttributionVersion,
    }: {
      conversation: ConversationResource;
      maxAttributionVersion: number;
    }
  ): Promise<{
    messages: ConversationConsumptionMessageFacts[];
  }> {
    const messages: ConversationConsumptionMessageFacts[] = [];
    const visitedConversationIds = new Set([conversation.sId]);
    let conversations = [conversation];
    let parentAgentIdsByConversationId = new Map<string, string>();

    for (
      let depth = 0;
      conversations.length > 0 && depth <= MAX_CONVERSATION_DEPTH;
      depth++
    ) {
      const directFacts = await this.fetchDirectConversationsConsumptionFacts(
        auth,
        {
          conversations,
          maxAttributionVersion,
          parentAgentIdsByConversationId,
        }
      );
      messages.push(...directFacts.messages);

      if (depth === MAX_CONVERSATION_DEPTH) {
        break;
      }

      const childConversationIds: string[] = [];
      const childParentAgentIdsByConversationId = new Map<string, string>();
      for (const message of directFacts.messages) {
        for (const action of message.actions) {
          const childConversationId = action.getRunAgentChildConversationId();
          if (
            childConversationId === null ||
            visitedConversationIds.has(childConversationId)
          ) {
            continue;
          }

          visitedConversationIds.add(childConversationId);
          childConversationIds.push(childConversationId);
          childParentAgentIdsByConversationId.set(
            childConversationId,
            message.agentConfigurationId
          );
        }
      }
      conversations = await ConversationResource.fetchByIds(
        auth,
        childConversationIds,
        { includeDeleted: true }
      );
      parentAgentIdsByConversationId = childParentAgentIdsByConversationId;
    }

    return { messages };
  }

  static async fetchDirectConversationsConsumptionFacts(
    auth: Authenticator,
    {
      conversations,
      maxAttributionVersion,
      parentAgentIdsByConversationId,
    }: {
      conversations: ConversationResource[];
      maxAttributionVersion: number;
      parentAgentIdsByConversationId: ReadonlyMap<string, string>;
    }
  ): Promise<{
    messages: ConversationConsumptionMessageFacts[];
  }> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const conversationIdsByModelId = new Map(
      conversations.map((conversation) => [conversation.id, conversation.sId])
    );
    const parentAgentIdsByConversationModelId = new Map(
      conversations.flatMap((conversation) => {
        const parentAgentId = parentAgentIdsByConversationId.get(
          conversation.sId
        );
        return parentAgentId ? [[conversation.id, parentAgentId] as const] : [];
      })
    );

    // Agent messages own the authoritative bill and the execution metadata needed to explain it.
    const agentMessages = await AgentMessageModel.findAll({
      attributes: [
        "id",
        "agentConfigurationId",
        "conversationId",
        "costCredits",
        "runIds",
        "status",
      ],
      where: {
        workspaceId,
        conversationId: { [Op.in]: [...conversationIdsByModelId.keys()] },
      },
      order: [["id", "ASC"]],
    });

    const messageFacts = agentMessages.map((agentMessage) => {
      const conversationId = conversationIdsByModelId.get(
        agentMessage.conversationId
      );
      assert(conversationId, "Agent message conversation not found.");

      return {
        agentMessageModelId: agentMessage.id,
        conversationId,
        agentConfigurationId: agentMessage.agentConfigurationId,
        parentAgentConfigurationId:
          parentAgentIdsByConversationModelId.get(
            agentMessage.conversationId
          ) ?? null,
        billedCredits: agentMessage.costCredits,
        dustRunIds: agentMessage.runIds ?? [],
        status: agentMessage.status,
      };
    });

    const fetchedAgentMessageModelIds = messageFacts.map(
      (message) => message.agentMessageModelId
    );

    // Attribution rows and actions stay attached to their owning message across conversations.
    const [items, actions] = await Promise.all([
      this.listByAgentMessageModelIds(auth, {
        agentMessageModelIds: fetchedAgentMessageModelIds,
        maxAttributionVersion,
      }),
      AgentMCPActionResource.listByAgentMessageIds(
        auth,
        fetchedAgentMessageModelIds
      ),
    ]);

    // Rebuild per-message facts because reconciliation happens independently for each bill.
    const itemsByMessageModelId = new Map<
      ModelId,
      AgentMessageConsumptionItemResource[]
    >();
    for (const item of items) {
      const messageItems = itemsByMessageModelId.get(item.agentMessageId) ?? [];
      messageItems.push(item);
      itemsByMessageModelId.set(item.agentMessageId, messageItems);
    }

    const actionsByMessageModelId = new Map<
      ModelId,
      AgentMCPActionResource[]
    >();
    for (const action of actions) {
      const messageActions =
        actionsByMessageModelId.get(action.agentMessageId) ?? [];
      messageActions.push(action);
      actionsByMessageModelId.set(action.agentMessageId, messageActions);
    }

    return {
      messages: messageFacts.map(
        ({
          agentMessageModelId,
          ...message
        }): ConversationConsumptionMessageFacts => ({
          ...message,
          items: itemsByMessageModelId.get(agentMessageModelId) ?? [],
          actions: actionsByMessageModelId.get(agentMessageModelId) ?? [],
        })
      ),
    };
  }

  /**
   * Resolves one public message identity to the persisted facts needed by the consumption reader.
   * Keeping that resolution here prevents Sequelize models and numeric IDs from leaking into the
   * read module or route.
   */
  static async fetchMessageConsumptionFacts(
    auth: Authenticator,
    {
      conversation,
      agentMessageId,
      maxAttributionVersion,
    }: {
      conversation: ConversationResource;
      agentMessageId: string;
      maxAttributionVersion: number;
    }
  ): Promise<{
    billedCredits: number | null;
    dustRunIds: string[];
    items: AgentMessageConsumptionItemResource[];
    actions: AgentMCPActionResource[];
  } | null> {
    const messageRes = await conversation.getMessageById(auth, agentMessageId);
    if (messageRes.isErr() || !messageRes.value.agentMessage) {
      return null;
    }

    const agentMessage = messageRes.value.agentMessage;
    const [items, actions] = await Promise.all([
      this.listByAgentMessageModelIds(auth, {
        agentMessageModelIds: [agentMessage.id],
        maxAttributionVersion,
      }),
      AgentMCPActionResource.listByAgentMessageIds(auth, [agentMessage.id]),
    ]);

    return {
      billedCredits: agentMessage.costCredits,
      dustRunIds: [...new Set(agentMessage.runIds ?? [])],
      items,
      actions,
    };
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
