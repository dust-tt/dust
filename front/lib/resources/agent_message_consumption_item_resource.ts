import type { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionItemModel } from "@app/lib/models/agent/agent_message_consumption_item";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import assert from "assert";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";
import { Op, QueryTypes } from "sequelize";

export type ConversationConsumptionMessageFacts = {
  agentMessageId: string;
  agentConfigurationId: string;
  parentAgentMessageId: string | null;
  billedCredits: number | null;
  dustRunIds: string[];
  items: AgentMessageConsumptionItemResource[];
  actions: AgentMCPActionResource[];
};

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
   * Bulk-inserts final tools, then completes only conflicting rows that are still pending. The
   * insert waits on concurrent writes to the unique action identity, so the following lookup sees
   * the settled conflict state without requiring a lock or allowing a stale pending write to win.
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
    // final tools directly, so they finish without the pending-row lookup below.
    if (insertedRows.every((row) => Boolean(row.id))) {
      return;
    }

    const recordByActionModelId = new Map(
      records.map((record) => [record.action.id, record])
    );
    const pendingRows = await this.model.findAll({
      attributes: ["id", "agentMCPActionId"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentMessageId: agentMessageModelId,
        attributionVersion,
        agentMCPActionId: { [Op.in]: [...recordByActionModelId.keys()] },
        itemType: "tool",
        completedAt: { [Op.is]: null },
      },
      transaction,
    });

    for (const pendingRow of pendingRows) {
      const actionModelId = pendingRow.agentMCPActionId;
      assert(
        actionModelId !== null,
        "A pending tool row must reference an action"
      );
      const record = recordByActionModelId.get(actionModelId);
      assert(
        record,
        "A pending tool row must have matching completion evidence"
      );

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
            id: pendingRow.id,
            workspaceId: auth.getNonNullableWorkspace().id,
            agentMessageId: agentMessageModelId,
            attributionVersion,
            itemType: "tool",
            completedAt: { [Op.is]: null },
          },
          transaction,
        }
      );
    }
  }

  /**
   * Writes one message's attribution breakdown for a single pass, idempotently and atomically.
   * Callers pass the whole desired set and this reconciles it in one transaction, so the materializer
   * never coordinates a read then separate inserts and updates.
   *
   * Three write shapes, one per identity class:
   * - Model buckets and already-final tools with no prior row are inserted, first write wins, so a
   *   re-finalize with the same identity is a no-op.
   * - A final tool is upserted on its (message, version, itemKey) identity only while the existing
   *   row is pending. This completes an approval-spanning tool without changing a completed fact.
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

  /**
   * Fetches the messages and persisted attribution facts belonging to a user-visible
   * conversation, including recursively spawned run-agent descendants. Agent handovers stay in
   * the root conversation and are already part of the seed query.
   */
  static async fetchConversationConsumptionFacts(
    auth: Authenticator,
    {
      conversation,
      attributionVersion,
    }: {
      conversation: ConversationResource;
      attributionVersion: number;
    }
  ): Promise<{
    messages: ConversationConsumptionMessageFacts[];
  }> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const query = `
      WITH RECURSIVE latest_root_agent_messages AS (
        SELECT DISTINCT ON (message.rank)
          message."sId" AS agent_message_id,
          message.visibility,
          agent_message.id AS agent_message_model_id,
          agent_message."agentConfigurationId" AS agent_configuration_id,
          agent_message."costCredits" AS billed_credits,
          agent_message."runIds" AS dust_run_ids,
          parent_user_message."agenticOriginMessageId"::text AS parent_agent_message_id
        FROM messages message
        JOIN agent_messages agent_message
          ON agent_message.id = message."agentMessageId"
         AND agent_message."workspaceId" = :workspaceId
        LEFT JOIN messages parent_message
          ON parent_message.id = message."parentId"
         AND parent_message."workspaceId" = :workspaceId
        LEFT JOIN user_messages parent_user_message
          ON parent_user_message.id = parent_message."userMessageId"
         AND parent_user_message."workspaceId" = :workspaceId
        WHERE message."workspaceId" = :workspaceId
          AND message."conversationId" = :conversationId
        ORDER BY message.rank ASC, message.version DESC
      ),
      scoped_agent_messages AS (
        SELECT
          root.agent_message_id,
          root.agent_message_model_id,
          root.agent_configuration_id,
          root.parent_agent_message_id,
          root.billed_credits,
          root.dust_run_ids,
          0 AS depth
        FROM latest_root_agent_messages root
        WHERE root.visibility != 'deleted'

        UNION ALL

        SELECT
          reply."sId" AS agent_message_id,
          child_agent_message.id AS agent_message_model_id,
          child_agent_message."agentConfigurationId" AS agent_configuration_id,
          parent.agent_message_id::text AS parent_agent_message_id,
          child_agent_message."costCredits" AS billed_credits,
          child_agent_message."runIds" AS dust_run_ids,
          parent.depth + 1 AS depth
        FROM scoped_agent_messages parent
        JOIN user_messages child_user_message
          ON child_user_message."agenticOriginMessageId" = parent.agent_message_id
         AND child_user_message."agenticMessageType" = 'run_agent'
         AND child_user_message."workspaceId" = :workspaceId
        JOIN messages child_user_message_envelope
          ON child_user_message_envelope."userMessageId" = child_user_message.id
         AND child_user_message_envelope."workspaceId" = :workspaceId
        JOIN LATERAL (
          SELECT candidate.*
          FROM messages candidate
          WHERE candidate."parentId" = child_user_message_envelope.id
            AND candidate."workspaceId" = :workspaceId
            AND candidate."agentMessageId" IS NOT NULL
          ORDER BY candidate.version DESC
          LIMIT 1
        ) reply ON TRUE
        JOIN agent_messages child_agent_message
          ON child_agent_message.id = reply."agentMessageId"
         AND child_agent_message."workspaceId" = :workspaceId
        WHERE parent.depth < 10
          AND reply.visibility != 'deleted'
      )
      SELECT DISTINCT ON (agent_message_model_id)
        agent_message_id,
        agent_message_model_id,
        agent_configuration_id,
        parent_agent_message_id,
        billed_credits,
        dust_run_ids
      FROM scoped_agent_messages
      ORDER BY agent_message_model_id
    `;

    // biome-ignore lint/plugin/noRawSql: recursive run-agent traversal has no Sequelize equivalent.
    const messages = await frontSequelize.query<{
      agent_message_id: string;
      agent_message_model_id: ModelId;
      agent_configuration_id: string;
      parent_agent_message_id: string | null;
      billed_credits: number | null;
      dust_run_ids: string[] | null;
    }>(query, {
      type: QueryTypes.SELECT,
      replacements: {
        workspaceId,
        conversationId: conversation.id,
      },
    });

    const messageFacts = messages.map((message) => ({
      agentMessageModelId: message.agent_message_model_id,
      agentMessageId: message.agent_message_id,
      agentConfigurationId: message.agent_configuration_id,
      parentAgentMessageId: message.parent_agent_message_id,
      billedCredits: message.billed_credits,
      dustRunIds: message.dust_run_ids ?? [],
    }));
    const agentMessageModelIds = messageFacts.map(
      (message) => message.agentMessageModelId
    );

    const [items, actions] = await Promise.all([
      this.listByAgentMessageModelIds(auth, {
        agentMessageModelIds,
        attributionVersion,
      }),
      AgentMCPActionResource.listByAgentMessageIds(auth, agentMessageModelIds),
    ]);

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
      attributionVersion,
    }: {
      conversation: ConversationResource;
      agentMessageId: string;
      attributionVersion: number;
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
        attributionVersion,
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
