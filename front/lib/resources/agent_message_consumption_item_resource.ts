import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { AgentMessageConsumptionItemModel } from "@app/lib/models/agent/agent_message_consumption_item";
import {
  AgentMessageModel,
  ConversationModel,
} from "@app/lib/models/agent/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import {
  RunModel,
  RunUsageModel,
} from "@app/lib/resources/storage/models/runs";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

interface ConsumptionItemEvidenceBase {
  grossAttributedCreditAmountMicro: number;
  state: "pending" | "completed";
}

export type AgentMessageConsumptionItemRecord =
  | (ConsumptionItemEvidenceBase & {
      itemType: "system" | "input";
      runUsageModelId: ModelId;
      inputTokensCount: number | null;
    })
  | (ConsumptionItemEvidenceBase & {
      itemType: "output" | "reasoning";
      runUsageModelId: ModelId;
      outputTokensCount: number | null;
    })
  | (ConsumptionItemEvidenceBase & {
      itemType: "tool";
      runUsageModelId: ModelId | null;
      agentMCPActionModelId: ModelId;
      inputTokensCount: number | null;
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

  private static hasSameSource(
    item: AgentMessageConsumptionItemModel,
    record: AgentMessageConsumptionItemRecord
  ): boolean {
    switch (record.itemType) {
      case "system":
      case "input":
      case "output":
      case "reasoning":
        return (
          item.itemType === record.itemType &&
          item.runUsageId === record.runUsageModelId &&
          item.agentMCPActionId === null
        );

      case "tool":
        return (
          item.itemType === "tool" &&
          item.runUsageId === record.runUsageModelId &&
          item.agentMCPActionId === record.agentMCPActionModelId
        );

      default:
        return assertNever(record);
    }
  }

  private static hasSameEvidence(
    item: AgentMessageConsumptionItemModel,
    evidence: ConsumptionItemEvidenceAttributes
  ): boolean {
    return (
      item.inputTokensCount === evidence.inputTokensCount &&
      item.outputTokensCount === evidence.outputTokensCount &&
      item.grossAttributedCreditAmountMicro ===
        evidence.grossAttributedCreditAmountMicro &&
      item.directCreditAmountMicro === evidence.directCreditAmountMicro
    );
  }

  private static async validateOwnership(
    auth: Authenticator,
    {
      conversationModelId,
      agentMessageModelId,
      records,
      transaction,
    }: {
      conversationModelId: ModelId;
      agentMessageModelId: ModelId;
      records: AgentMessageConsumptionItemRecord[];
      transaction: Transaction;
    }
  ): Promise<void> {
    const workspaceModelId = auth.getNonNullableWorkspace().id;
    const [conversation, agentMessage] = await Promise.all([
      ConversationModel.findOne({
        where: { id: conversationModelId, workspaceId: workspaceModelId },
        transaction,
      }),
      AgentMessageModel.findOne({
        where: { id: agentMessageModelId, workspaceId: workspaceModelId },
        transaction,
      }),
    ]);

    if (!conversation || !agentMessage) {
      throw new Error("Consumption item owner was not found in the workspace");
    }
    if (agentMessage.conversationId !== conversation.id) {
      throw new Error(
        "Consumption item conversation does not own the agent message"
      );
    }

    const runUsageModelIds = [
      ...new Set(
        records.flatMap((record) =>
          record.runUsageModelId === null ? [] : [record.runUsageModelId]
        )
      ),
    ];
    if (runUsageModelIds.length > 0) {
      const runUsages = await RunUsageModel.findAll({
        where: {
          id: { [Op.in]: runUsageModelIds },
          workspaceId: workspaceModelId,
        },
        transaction,
      });
      const runs = await RunModel.findAll({
        where: {
          id: { [Op.in]: runUsages.map((usage) => usage.runId) },
          workspaceId: workspaceModelId,
        },
        transaction,
      });
      const runByModelId = new Map(runs.map((run) => [run.id, run]));
      const messageRunIds = new Set(agentMessage.runIds ?? []);
      if (
        runUsages.length !== runUsageModelIds.length ||
        runUsages.some((usage) => {
          const run = runByModelId.get(usage.runId);
          return !run || !messageRunIds.has(run.dustRunId);
        })
      ) {
        throw new Error(
          "Consumption item run usage does not belong to the agent message"
        );
      }
    }

    const actionModelIds = [
      ...new Set(
        records.flatMap((record) =>
          record.itemType === "tool" ? [record.agentMCPActionModelId] : []
        )
      ),
    ];
    if (actionModelIds.length > 0) {
      const actions = await AgentMCPActionModel.findAll({
        where: {
          id: { [Op.in]: actionModelIds },
          workspaceId: workspaceModelId,
          agentMessageId: agentMessageModelId,
        },
        transaction,
      });
      if (actions.length !== actionModelIds.length) {
        throw new Error(
          "Consumption item action does not belong to the agent message"
        );
      }
    }
  }

  static async recordItems(
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
  ): Promise<AgentMessageConsumptionItemResource[]> {
    if (records.length === 0) {
      return [];
    }

    return withTransaction(async (currentTransaction) => {
      const itemKeys = records.map((record) => this.itemKey(record));
      if (new Set(itemKeys).size !== itemKeys.length) {
        throw new Error("Consumption items contain duplicate identities");
      }

      await this.validateOwnership(auth, {
        conversationModelId,
        agentMessageModelId,
        records,
        transaction: currentTransaction,
      });

      const workspaceModelId = auth.getNonNullableWorkspace().id;
      const completedAt = new Date();
      await this.model.bulkCreate(
        records.map((record) => {
          const attributes = this.evidenceAttributes(record);
          return {
            ...attributes,
            workspaceId: workspaceModelId,
            conversationId: conversationModelId,
            agentMessageId: agentMessageModelId,
            runUsageId: record.runUsageModelId,
            agentMCPActionId:
              record.itemType === "tool" ? record.agentMCPActionModelId : null,
            itemKey: this.itemKey(record),
            itemType: record.itemType,
            attributionVersion,
            completedAt: record.state === "completed" ? completedAt : null,
          };
        }),
        {
          ignoreDuplicates: true,
          transaction: currentTransaction,
          validate: true,
        }
      );

      const items = await this.model.findAll({
        where: {
          workspaceId: workspaceModelId,
          agentMessageId: agentMessageModelId,
          attributionVersion,
          itemKey: { [Op.in]: itemKeys },
        },
        lock: currentTransaction.LOCK.UPDATE,
        order: [["id", "ASC"]],
        transaction: currentTransaction,
      });
      const itemByKey = new Map(items.map((item) => [item.itemKey, item]));

      for (const record of records) {
        const itemKey = this.itemKey(record);
        const item = itemByKey.get(itemKey);
        if (
          !item ||
          item.conversationId !== conversationModelId ||
          !this.hasSameSource(item, record)
        ) {
          throw new Error(`Conflicting consumption item identity ${itemKey}`);
        }
        const attributes = this.evidenceAttributes(record);
        if (item.completedAt !== null) {
          if (
            record.state === "completed" &&
            !this.hasSameEvidence(item, attributes)
          ) {
            throw new Error(
              `Completed consumption item ${itemKey} is immutable`
            );
          }
          continue;
        }

        if (
          record.state === "pending" &&
          this.hasSameEvidence(item, attributes)
        ) {
          continue;
        }

        item.set({
          ...attributes,
          completedAt: record.state === "completed" ? completedAt : null,
        });
        await item.save({ transaction: currentTransaction });
      }

      return items.map((item) => new this(this.model, item.get()));
    }, transaction);
  }

  static async listByAgentMessageModelId(
    auth: Authenticator,
    {
      agentMessageModelId,
      attributionVersion,
      transaction,
    }: {
      agentMessageModelId: ModelId;
      attributionVersion: number;
      transaction?: Transaction;
    }
  ): Promise<AgentMessageConsumptionItemResource[]> {
    const items = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentMessageId: agentMessageModelId,
        attributionVersion,
      },
      order: [["id", "ASC"]],
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
