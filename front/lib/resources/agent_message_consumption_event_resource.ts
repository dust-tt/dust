import type { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionEventModel } from "@app/lib/models/agent/agent_message_consumption_event";
import type { AgentMessageModel } from "@app/lib/models/agent/conversation";
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

export type StoredConsumptionEvent =
  | {
      kind: "items_changed";
      eventKey: string;
      runKey: string;
      rootAgentMessageId: string;
      agentMessageModelId: ModelId;
      consumptionItemIds: ModelId[];
    }
  | {
      kind: "execution_started";
      eventKey: string;
      runKey: string;
      rootAgentMessageId: string;
      agentMessageModelId: ModelId;
      subagentAgentMessageId: AgentMessageModel["id"] | null;
    }
  | {
      kind: "execution_finalized";
      eventKey: string;
      runKey: string;
      rootAgentMessageId: string;
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
    event: StoredConsumptionEvent
  ): CreationAttributes<AgentMessageConsumptionEventModel> {
    const commonAttributes = {
      workspaceId: auth.getNonNullableWorkspace().id,
      agentMessageId: event.agentMessageModelId,
      runKey: event.runKey,
      rootAgentMessageId: event.rootAgentMessageId,
      eventKey: event.eventKey,
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
          subagentAgentMessageId: null,
        };
      }

      case "execution_started": {
        return {
          ...commonAttributes,
          kind: event.kind,
          consumptionItemIds: null,
          status: null,
          subagentAgentMessageId: event.subagentAgentMessageId,
        };
      }

      case "execution_finalized": {
        return {
          ...commonAttributes,
          kind: event.kind,
          consumptionItemIds: null,
          status: event.status,
          subagentAgentMessageId: null,
        };
      }

      default:
        return assertNever(event);
    }
  }

  static async append(
    auth: Authenticator,
    event: StoredConsumptionEvent,
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
        subagentAgentMessageId: row.subagentAgentMessageId,
      },
      {
        agentMessageId: attributes.agentMessageId,
        runKey: attributes.runKey,
        rootAgentMessageId: attributes.rootAgentMessageId,
        kind: attributes.kind,
        consumptionItemIds: attributes.consumptionItemIds,
        status: attributes.status,
        subagentAgentMessageId: attributes.subagentAgentMessageId,
      },
      "A consumption event key cannot identify different events"
    );
    return new this(this.model, row.get());
  }

  static async listAfter(
    auth: Authenticator,
    {
      runKey,
      afterEventModelId,
      limit,
    }: {
      runKey: string;
      afterEventModelId: ModelId | null;
      limit: number;
    }
  ): Promise<AgentMessageConsumptionEventResource[]> {
    assert(limit > 0 && limit <= 1_000, "Invalid consumption event batch size");
    const rows = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        runKey,
        ...(afterEventModelId === null
          ? {}
          : { id: { [Op.gt]: afterEventModelId } }),
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

  async delete(): Promise<Result<undefined, Error>> {
    return new Err(
      new Error("Consumption events can only be deleted by retention cleanup")
    );
  }
}
