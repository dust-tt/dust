import type { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionEventModel } from "@app/lib/models/agent/agent_message_consumption_event";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import assert from "assert";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";
import { Op } from "sequelize";

export type ConsumptionEvent =
  | {
      kind: "items_changed";
      idempotencyKey: string;
      runKey: string;
      rootAgentMessageId: ModelId;
      agentMessageModelId: ModelId;
      consumptionItemIds: ModelId[];
    }
  | {
      kind: "execution_started";
      idempotencyKey: string;
      runKey: string;
      rootAgentMessageId: ModelId;
      agentMessageModelId: ModelId;
    }
  | {
      kind: "execution_finalized";
      idempotencyKey: string;
      runKey: string;
      rootAgentMessageId: ModelId;
      agentMessageModelId: ModelId;
      status: AgentMessageStatus;
    };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AgentMessageConsumptionEventResource
  extends ReadonlyAttributesType<AgentMessageConsumptionEventModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentMessageConsumptionEventResource extends BaseResource<AgentMessageConsumptionEventModel> {
  static model: ModelStaticWorkspaceAware<AgentMessageConsumptionEventModel> =
    AgentMessageConsumptionEventModel;

  constructor(
    model: ModelStaticWorkspaceAware<AgentMessageConsumptionEventModel>,
    blob: Attributes<AgentMessageConsumptionEventModel>
  ) {
    super(model, blob);
  }

  private static creationAttributes(
    auth: Authenticator,
    event: ConsumptionEvent
  ): CreationAttributes<AgentMessageConsumptionEventModel> {
    const commonAttributes = {
      workspaceId: auth.getNonNullableWorkspace().id,
      agentMessageId: event.agentMessageModelId,
      runKey: event.runKey,
      rootAgentMessageId: event.rootAgentMessageId,
      eventKey: event.idempotencyKey,
    };

    switch (event.kind) {
      case "items_changed": {
        assert(
          event.consumptionItemIds.length > 0,
          "An item event must change rows"
        );
        return {
          ...commonAttributes,
          kind: event.kind,
          consumptionItemIds: event.consumptionItemIds,
          status: null,
        };
      }

      case "execution_started": {
        return {
          ...commonAttributes,
          kind: event.kind,
          consumptionItemIds: null,
          status: null,
        };
      }

      case "execution_finalized": {
        return {
          ...commonAttributes,
          kind: event.kind,
          consumptionItemIds: null,
          status: event.status,
        };
      }

      default:
        return assertNever(event);
    }
  }

  static async append(
    auth: Authenticator,
    event: ConsumptionEvent,
    { transaction }: { transaction: Transaction }
  ): Promise<AgentMessageConsumptionEventResource> {
    const attributes = this.creationAttributes(auth, event);
    const [row] = await this.model.findOrCreate({
      where: {
        workspaceId: attributes.workspaceId,
        eventKey: attributes.eventKey,
      },
      defaults: attributes,
      transaction,
    });
    assert.deepStrictEqual(
      {
        agentMessageId: row.agentMessageId,
        runKey: row.runKey,
        rootAgentMessageId: row.rootAgentMessageId,
        kind: row.kind,
        consumptionItemIds: row.consumptionItemIds,
        status: row.status,
      },
      {
        agentMessageId: attributes.agentMessageId,
        runKey: attributes.runKey,
        rootAgentMessageId: attributes.rootAgentMessageId,
        kind: attributes.kind,
        consumptionItemIds: attributes.consumptionItemIds,
        status: attributes.status,
      },
      "A consumption event key cannot identify different events"
    );
    return new this(this.model, row.get());
  }

  static async listUnprocessed(
    auth: Authenticator,
    { runKey, limit }: { runKey: string; limit: number }
  ): Promise<AgentMessageConsumptionEventResource[]> {
    assert(limit > 0 && limit <= 1_000, "Invalid consumption event batch size");
    const rows = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        runKey,
        processedAt: null,
      },
      order: [["id", "ASC"]],
      limit,
    });

    return rows.map((row) => new this(this.model, row.get()));
  }

  static async fetchByEventKey(
    auth: Authenticator,
    { eventKey }: { eventKey: string }
  ): Promise<AgentMessageConsumptionEventResource | null> {
    const row = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        eventKey,
      },
    });
    return row ? new this(this.model, row.get()) : null;
  }

  static async deleteByAgentMessageModelIds(
    auth: Authenticator,
    { agentMessageModelIds }: { agentMessageModelIds: ModelId[] }
  ): Promise<number> {
    if (agentMessageModelIds.length === 0) {
      return 0;
    }
    return this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentMessageId: { [Op.in]: agentMessageModelIds },
      },
    });
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<number> {
    return this.model.destroy({
      where: { workspaceId: auth.getNonNullableWorkspace().id },
    });
  }

  static async markProcessed(
    auth: Authenticator,
    {
      runKey,
      eventIds,
      processedAt,
    }: {
      runKey: string;
      eventIds: ModelId[];
      processedAt: Date;
    }
  ): Promise<number> {
    assert(
      eventIds.length > 0 && eventIds.length <= 1_000,
      "Invalid consumption event acknowledgement batch size"
    );
    const [updatedCount] = await this.model.update(
      { processedAt },
      {
        where: {
          id: { [Op.in]: eventIds },
          workspaceId: auth.getNonNullableWorkspace().id,
          runKey,
          processedAt: null,
        },
      }
    );
    return updatedCount;
  }

  async delete(): Promise<Result<undefined, Error>> {
    return new Err(
      new Error("Consumption events can only be deleted by retention cleanup")
    );
  }
}
