import type { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionItemModel } from "@app/lib/models/agent/agent_message_consumption_item";
import { BaseResource } from "@app/lib/resources/base_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";
import { Op, QueryTypes } from "sequelize";

type ConsumptionItemState = "pending" | "completed";

interface ConsumptionItemEvidenceBase<
  TState extends ConsumptionItemState = ConsumptionItemState,
> {
  grossAttributedCreditAmountMicro: number;
  state: TState;
}

export type AgentMessageConsumptionItemRecord<
  TState extends ConsumptionItemState = ConsumptionItemState,
> =
  | (ConsumptionItemEvidenceBase<TState> & {
      itemType: "system" | "input";
      runUsageModelId: ModelId;
      inputTokensCount: number | null;
    })
  | (ConsumptionItemEvidenceBase<TState> & {
      itemType: "output" | "reasoning";
      runUsageModelId: ModelId;
      outputTokensCount: number | null;
    })
  | (ConsumptionItemEvidenceBase<TState> & {
      itemType: "tool";
      runUsageModelId: ModelId | null;
      agentMCPActionModelId: ModelId;
      /** Estimated tokens in the result returned by this tool execution */
      inputTokensCount: number | null;
      /** Estimated tokens in the model output that emitted the tool name and arguments */
      outputTokensCount: number | null;
      directCreditAmountMicro: number | null;
    });

type ConsumptionItemEvidenceAttributes = Pick<
  Attributes<AgentMessageConsumptionItemModel>,
  | "inputTokensCount"
  | "outputTokensCount"
  | "grossAttributedCreditAmountMicro"
  | "directCreditAmountMicro"
>;

type ConsumptionItemCreationAttributes =
  CreationAttributes<AgentMessageConsumptionItemModel>;

const UPSERT_COLUMNS = [
  "workspaceId",
  "conversationId",
  "agentMessageId",
  "runUsageId",
  "agentMCPActionId",
  "itemKey",
  "itemType",
  "attributionVersion",
  "inputTokensCount",
  "outputTokensCount",
  "grossAttributedCreditAmountMicro",
  "directCreditAmountMicro",
  "completedAt",
  "createdAt",
  "updatedAt",
] as const satisfies ReadonlyArray<keyof ConsumptionItemCreationAttributes>;

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

  private static itemKey(record: AgentMessageConsumptionItemRecord): string {
    switch (record.itemType) {
      case "system":
      case "input":
      case "output":
      case "reasoning":
        return `run-usage:${record.runUsageModelId}:${record.itemType}`;

      case "tool":
        return `tool-action:${record.agentMCPActionModelId}`;

      default:
        return assertNever(record);
    }
  }

  private static evidenceAttributes(
    record: AgentMessageConsumptionItemRecord
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
    records: AgentMessageConsumptionItemRecord[]
  ): void {
    const itemKeys = records.map((record) => this.itemKey(record));
    if (new Set(itemKeys).size !== itemKeys.length) {
      throw new Error("Consumption items contain duplicate identities");
    }
  }

  private static creationAttributes(
    workspaceModelId: ModelId,
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
      record: AgentMessageConsumptionItemRecord;
      now: Date;
    }
  ): ConsumptionItemCreationAttributes {
    return {
      ...this.evidenceAttributes(record),
      workspaceId: workspaceModelId,
      conversationId: conversationModelId,
      agentMessageId: agentMessageModelId,
      runUsageId: record.runUsageModelId,
      agentMCPActionId:
        record.itemType === "tool" ? record.agentMCPActionModelId : null,
      itemKey: this.itemKey(record),
      itemType: record.itemType,
      attributionVersion,
      completedAt: record.state === "completed" ? now : null,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Inserts initial attribution facts without changing an existing identity
   * Normal executions insert completed facts while approval stops insert pending facts
   */
  static async insertItemsIdempotently(
    auth: Authenticator,
    {
      conversationModelId,
      agentMessageModelId,
      attributionVersion,
      records,
      transaction,
    }: {
      conversationModelId: ModelId;
      agentMessageModelId: ModelId;
      attributionVersion: number;
      records: AgentMessageConsumptionItemRecord[];
      transaction?: Transaction;
    }
  ): Promise<void> {
    if (records.length === 0) {
      return;
    }

    this.assertUniqueItemKeys(records);
    const now = new Date();
    await this.model.bulkCreate(
      records.map((record) =>
        this.creationAttributes(auth.getNonNullableWorkspace().id, {
          conversationModelId,
          agentMessageModelId,
          attributionVersion,
          record,
          now,
        })
      ),
      { ignoreDuplicates: true, transaction, validate: true }
    );
  }

  /**
   * Completes approval-spanning facts
   * A missing pending fact is inserted and an already completed fact stays immutable
   */
  static async completeItemsIdempotently(
    auth: Authenticator,
    {
      conversationModelId,
      agentMessageModelId,
      attributionVersion,
      records,
      transaction,
    }: {
      conversationModelId: ModelId;
      agentMessageModelId: ModelId;
      attributionVersion: number;
      records: AgentMessageConsumptionItemRecord<"completed">[];
      transaction?: Transaction;
    }
  ): Promise<void> {
    if (records.length === 0) {
      return;
    }

    this.assertUniqueItemKeys(records);
    const now = new Date();
    const attributes = records.map((record) =>
      this.creationAttributes(auth.getNonNullableWorkspace().id, {
        conversationModelId,
        agentMessageModelId,
        attributionVersion,
        record,
        now,
      })
    );
    for (const itemAttributes of attributes) {
      await this.model.build(itemAttributes).validate();
    }

    const bind = attributes.flatMap((itemAttributes) =>
      UPSERT_COLUMNS.map((column) => itemAttributes[column])
    );
    const valueTuples = attributes.map((_, rowIndex) => {
      const firstParameterIndex = rowIndex * UPSERT_COLUMNS.length + 1;
      return `(${UPSERT_COLUMNS.map(
        (__, columnIndex) => `$${firstParameterIndex + columnIndex}`
      ).join(", ")})`;
    });
    const quotedColumns = UPSERT_COLUMNS.map((column) => `"${column}"`).join(
      ", "
    );

    // biome-ignore lint/plugin/noRawSql: Conditional upsert prevents pending completion races
    await frontSequelize.query(
      `INSERT INTO "agent_message_consumption_items" (${quotedColumns})
       VALUES ${valueTuples.join(", ")}
       ON CONFLICT ("workspaceId", "agentMessageId", "attributionVersion", "itemKey")
       DO UPDATE SET
         "inputTokensCount" = EXCLUDED."inputTokensCount",
         "outputTokensCount" = EXCLUDED."outputTokensCount",
         "grossAttributedCreditAmountMicro" = EXCLUDED."grossAttributedCreditAmountMicro",
         "directCreditAmountMicro" = EXCLUDED."directCreditAmountMicro",
         "completedAt" = EXCLUDED."completedAt",
         "updatedAt" = EXCLUDED."updatedAt"
       WHERE "agent_message_consumption_items"."completedAt" IS NULL`,
      { bind, type: QueryTypes.INSERT, transaction }
    );
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
