import type { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionItemModel } from "@app/lib/models/agent/agent_message_consumption_item";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";
import { Op } from "sequelize";

export type AgentMessageConsumptionItemCreate = Omit<
  CreationAttributes<AgentMessageConsumptionItemModel>,
  "workspaceId"
>;

export interface AgentMessageConsumptionItemResource
  extends ReadonlyAttributesType<AgentMessageConsumptionItemModel> {}

export class AgentMessageConsumptionItemResource extends BaseResource<AgentMessageConsumptionItemModel> {
  static model: ModelStaticWorkspaceAware<AgentMessageConsumptionItemModel> =
    AgentMessageConsumptionItemModel;

  constructor(
    model: ModelStaticWorkspaceAware<AgentMessageConsumptionItemModel>,
    blob: Attributes<AgentMessageConsumptionItemModel>
  ) {
    super(model, blob);
  }

  async delete(): Promise<Result<undefined, Error>> {
    return new Err(
      new Error("Agent message consumption items cannot be deleted directly")
    );
  }

  static async createIdempotently(
    auth: Authenticator,
    items: AgentMessageConsumptionItemCreate[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }

    await this.model.bulkCreate(
      items.map((item) => ({
        ...item,
        workspaceId: auth.getNonNullableWorkspace().id,
      })),
      {
        ignoreDuplicates: true,
        transaction,
        validate: true,
      }
    );

    const agentMessageModelIds = items.flatMap((item) =>
      item.agentMessageId === undefined ? [] : [item.agentMessageId]
    );
    const storedItems = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentMessageId: { [Op.in]: agentMessageModelIds },
        attributionVersion: {
          [Op.in]: items.map((item) => item.attributionVersion),
        },
        itemKey: { [Op.in]: items.map((item) => item.itemKey) },
      },
      transaction,
    });
    const storedByIdentity = new Map(
      storedItems.map((item) => [
        `${item.agentMessageId}:${item.attributionVersion}:${item.itemKey}`,
        item,
      ])
    );
    for (const item of items) {
      const stored = storedByIdentity.get(
        `${item.agentMessageId}:${item.attributionVersion}:${item.itemKey}`
      );
      if (
        !stored ||
        stored.conversationId !== item.conversationId ||
        stored.runUsageId !== (item.runUsageId ?? null) ||
        stored.agentMCPActionId !== (item.agentMCPActionId ?? null) ||
        stored.itemType !== item.itemType
      ) {
        throw new Error(
          `Conflicting consumption attribution item ${item.itemKey}`
        );
      }
    }
  }

  static async listByAgentMessage(
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

  static async findToolItem(
    auth: Authenticator,
    {
      agentMCPActionModelId,
      attributionVersion,
      transaction,
    }: {
      agentMCPActionModelId: ModelId;
      attributionVersion: number;
      transaction?: Transaction;
    }
  ): Promise<AgentMessageConsumptionItemResource | null> {
    const item = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentMCPActionId: agentMCPActionModelId,
        attributionVersion,
        itemType: "tool",
      },
      transaction,
    });

    return item ? new this(this.model, item.get()) : null;
  }

  static async updatePendingToolItem(
    auth: Authenticator,
    {
      agentMCPActionModelId,
      attributionVersion,
      inputTokensCount,
      grossAttributedCreditAmountMicro,
      directCreditAmountMicro,
      completedAt,
      transaction,
    }: {
      agentMCPActionModelId: ModelId;
      attributionVersion: number;
      inputTokensCount: number | null;
      grossAttributedCreditAmountMicro: number;
      directCreditAmountMicro: number | null;
      completedAt: Date | null;
      transaction?: Transaction;
    }
  ): Promise<number> {
    if (inputTokensCount !== null && inputTokensCount < 0) {
      throw new Error("Tool input tokens cannot be negative");
    }
    if (grossAttributedCreditAmountMicro < 0) {
      throw new Error("Gross attributed credits cannot be negative");
    }
    if (
      directCreditAmountMicro !== null &&
      (directCreditAmountMicro < 0 ||
        directCreditAmountMicro > grossAttributedCreditAmountMicro)
    ) {
      throw new Error(
        "Direct credits must fit within gross attributed credits"
      );
    }

    const [updatedCount] = await this.model.update(
      {
        inputTokensCount,
        grossAttributedCreditAmountMicro,
        directCreditAmountMicro,
        completedAt,
      },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          agentMCPActionId: agentMCPActionModelId,
          attributionVersion,
          itemType: "tool",
          completedAt: { [Op.is]: null },
        },
        validate: false,
        transaction,
      }
    );

    return updatedCount;
  }

  static async updatePendingOutputItem(
    auth: Authenticator,
    {
      runUsageModelId,
      attributionVersion,
      outputTokensCount,
      grossAttributedCreditAmountMicro,
      transaction,
    }: {
      runUsageModelId: ModelId;
      attributionVersion: number;
      outputTokensCount: number;
      grossAttributedCreditAmountMicro: number;
      transaction?: Transaction;
    }
  ): Promise<number> {
    const [updatedCount] = await this.model.update(
      {
        outputTokensCount,
        grossAttributedCreditAmountMicro,
        completedAt: new Date(),
      },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          runUsageId: runUsageModelId,
          attributionVersion,
          itemType: "output",
          completedAt: { [Op.is]: null },
        },
        validate: false,
        transaction,
      }
    );

    return updatedCount;
  }

  static async updatePendingToolOutput(
    auth: Authenticator,
    {
      agentMCPActionModelId,
      attributionVersion,
      outputTokensCount,
      grossAttributedCreditAmountMicro,
      transaction,
    }: {
      agentMCPActionModelId: ModelId;
      attributionVersion: number;
      outputTokensCount: number;
      grossAttributedCreditAmountMicro: number;
      transaction?: Transaction;
    }
  ): Promise<number> {
    const [updatedCount] = await this.model.update(
      {
        outputTokensCount,
        grossAttributedCreditAmountMicro,
      },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          agentMCPActionId: agentMCPActionModelId,
          attributionVersion,
          itemType: "tool",
          completedAt: { [Op.is]: null },
        },
        validate: false,
        transaction,
      }
    );

    return updatedCount;
  }
}
