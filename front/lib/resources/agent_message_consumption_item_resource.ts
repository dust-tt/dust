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
import type { AgentMessageConsumptionItemType } from "@app/types/assistant/agent_message_consumption";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

type NonToolConsumptionItemType = Exclude<
  AgentMessageConsumptionItemType,
  "tool"
>;

export type AgentMessageConsumptionItemSource =
  | {
      itemType: NonToolConsumptionItemType;
      runUsageModelId: ModelId;
    }
  | {
      itemType: "tool";
      runUsageModelId: ModelId | null;
      agentMCPActionModelId: ModelId;
    };

interface ConsumptionItemEvidenceBase {
  grossAttributedCreditAmountMicro: number;
  state: "pending" | "completed";
}

export type AgentMessageConsumptionItemEvidence =
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

  private static itemKey(source: AgentMessageConsumptionItemSource): string {
    switch (source.itemType) {
      case "system":
      case "input":
      case "output":
      case "reasoning":
        return `run-usage:${source.runUsageModelId}:${source.itemType}`;

      case "tool":
        return `tool-action:${source.agentMCPActionModelId}`;

      default:
        return assertNever(source);
    }
  }

  private static evidenceAttributes(
    evidence: AgentMessageConsumptionItemEvidence
  ): ConsumptionItemEvidenceAttributes {
    switch (evidence.itemType) {
      case "system":
      case "input":
        return {
          inputTokensCount: evidence.inputTokensCount,
          outputTokensCount: null,
          grossAttributedCreditAmountMicro:
            evidence.grossAttributedCreditAmountMicro,
          directCreditAmountMicro: null,
        };

      case "output":
      case "reasoning":
        return {
          inputTokensCount: null,
          outputTokensCount: evidence.outputTokensCount,
          grossAttributedCreditAmountMicro:
            evidence.grossAttributedCreditAmountMicro,
          directCreditAmountMicro: null,
        };

      case "tool":
        return {
          inputTokensCount: evidence.inputTokensCount,
          outputTokensCount: evidence.outputTokensCount,
          grossAttributedCreditAmountMicro:
            evidence.grossAttributedCreditAmountMicro,
          directCreditAmountMicro: evidence.directCreditAmountMicro,
        };

      default:
        return assertNever(evidence);
    }
  }

  private static hasSameSource(
    item: AgentMessageConsumptionItemModel,
    source: AgentMessageConsumptionItemSource
  ): boolean {
    switch (source.itemType) {
      case "system":
      case "input":
      case "output":
      case "reasoning":
        return (
          item.itemType === source.itemType &&
          item.runUsageId === source.runUsageModelId &&
          item.agentMCPActionId === null
        );

      case "tool":
        return (
          item.itemType === "tool" &&
          item.runUsageId === source.runUsageModelId &&
          item.agentMCPActionId === source.agentMCPActionModelId
        );

      default:
        return assertNever(source);
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
      sources,
      transaction,
    }: {
      conversationModelId: ModelId;
      agentMessageModelId: ModelId;
      sources: AgentMessageConsumptionItemSource[];
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
        sources.flatMap((source) =>
          source.runUsageModelId === null ? [] : [source.runUsageModelId]
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
        sources.flatMap((source) =>
          source.itemType === "tool" ? [source.agentMCPActionModelId] : []
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

  static async createPendingItems(
    auth: Authenticator,
    {
      conversationModelId,
      agentMessageModelId,
      attributionVersion,
      sources,
      transaction,
    }: {
      conversationModelId: ModelId;
      agentMessageModelId: ModelId;
      attributionVersion: number;
      sources: AgentMessageConsumptionItemSource[];
      transaction?: Transaction;
    }
  ): Promise<AgentMessageConsumptionItemResource[]> {
    if (sources.length === 0) {
      return [];
    }

    return withTransaction(async (currentTransaction) => {
      await this.validateOwnership(auth, {
        conversationModelId,
        agentMessageModelId,
        sources,
        transaction: currentTransaction,
      });

      const workspaceModelId = auth.getNonNullableWorkspace().id;
      await this.model.bulkCreate(
        sources.map((source) => ({
          workspaceId: workspaceModelId,
          conversationId: conversationModelId,
          agentMessageId: agentMessageModelId,
          runUsageId: source.runUsageModelId,
          agentMCPActionId:
            source.itemType === "tool" ? source.agentMCPActionModelId : null,
          itemKey: this.itemKey(source),
          itemType: source.itemType,
          attributionVersion,
          inputTokensCount: null,
          outputTokensCount: null,
          grossAttributedCreditAmountMicro: 0,
          directCreditAmountMicro: null,
          completedAt: null,
        })),
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
          itemKey: { [Op.in]: sources.map((source) => this.itemKey(source)) },
        },
        order: [["id", "ASC"]],
        transaction: currentTransaction,
      });
      const itemByKey = new Map(items.map((item) => [item.itemKey, item]));

      for (const source of sources) {
        const item = itemByKey.get(this.itemKey(source));
        if (
          !item ||
          item.conversationId !== conversationModelId ||
          !this.hasSameSource(item, source)
        ) {
          throw new Error(
            `Conflicting consumption item identity ${this.itemKey(source)}`
          );
        }
      }

      return items.map((item) => new this(this.model, item.get()));
    }, transaction);
  }

  static async setEvidence(
    auth: Authenticator,
    {
      agentMessageModelId,
      attributionVersion,
      evidence,
      transaction,
    }: {
      agentMessageModelId: ModelId;
      attributionVersion: number;
      evidence: AgentMessageConsumptionItemEvidence;
      transaction?: Transaction;
    }
  ): Promise<AgentMessageConsumptionItemResource> {
    return withTransaction(async (currentTransaction) => {
      const workspaceModelId = auth.getNonNullableWorkspace().id;
      const itemKey = this.itemKey(evidence);
      const item = await this.model.findOne({
        where: {
          workspaceId: workspaceModelId,
          agentMessageId: agentMessageModelId,
          attributionVersion,
          itemKey,
        },
        lock: currentTransaction.LOCK.UPDATE,
        transaction: currentTransaction,
      });
      if (!item || !this.hasSameSource(item, evidence)) {
        throw new Error(`Consumption item ${itemKey} was not initialized`);
      }

      const attributes = this.evidenceAttributes(evidence);
      if (item.completedAt !== null) {
        if (
          evidence.state === "completed" &&
          !this.hasSameEvidence(item, attributes)
        ) {
          throw new Error(`Completed consumption item ${itemKey} is immutable`);
        }
        return new this(this.model, item.get());
      }

      item.set({
        ...attributes,
        completedAt: evidence.state === "completed" ? new Date() : null,
      });
      await item.save({ transaction: currentTransaction });

      return new this(this.model, item.get());
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
