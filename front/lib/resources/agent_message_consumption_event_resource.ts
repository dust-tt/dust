import type { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionEventModel } from "@app/lib/models/agent/agent_message_consumption_event";
import type { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { EnabledAgentMessageConsumptionMode } from "@app/types/assistant/agent_message_consumption";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import assert from "assert";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";
import { Op, QueryTypes } from "sequelize";

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
      consumptionMode: EnabledAgentMessageConsumptionMode;
    }
  | {
      kind: "execution_finalized";
      eventKey: string;
      runKey: string;
      rootAgentMessageId: string;
      agentMessageModelId: ModelId;
      status: AgentMessageStatus;
      consumptionMode: EnabledAgentMessageConsumptionMode;
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
          consumptionMode: null,
        };
      }

      case "execution_started": {
        return {
          ...commonAttributes,
          kind: event.kind,
          consumptionItemIds: null,
          status: null,
          subagentAgentMessageId: event.subagentAgentMessageId,
          consumptionMode: event.consumptionMode,
        };
      }

      case "execution_finalized": {
        return {
          ...commonAttributes,
          kind: event.kind,
          consumptionItemIds: null,
          status: event.status,
          subagentAgentMessageId: null,
          consumptionMode: event.consumptionMode,
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
        consumptionMode: row.consumptionMode,
      },
      {
        agentMessageId: attributes.agentMessageId,
        runKey: attributes.runKey,
        rootAgentMessageId: attributes.rootAgentMessageId,
        kind: attributes.kind,
        consumptionItemIds: attributes.consumptionItemIds,
        status: attributes.status,
        subagentAgentMessageId: attributes.subagentAgentMessageId,
        consumptionMode: attributes.consumptionMode,
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

  static async listOldestUnprocessedExecutions({
    limit,
  }: {
    limit: number;
  }): Promise<{
    executions: { runKey: string; workspaceModelId: ModelId }[];
    hasMore: boolean;
  }> {
    assert(limit > 0 && limit <= 10_000, "Invalid outbox recovery scan size");
    const rows = await this.model.findAll({
      attributes: ["workspaceId", "runKey"],
      where: { processedAt: null },
      order: [["id", "ASC"]],
      limit,
    });
    const seen = new Set<string>();
    const executions = rows.flatMap((row) => {
      const key = `${row.workspaceId}:${row.runKey}`;
      if (seen.has(key)) {
        return [];
      }
      seen.add(key);
      return [{ runKey: row.runKey, workspaceModelId: row.workspaceId }];
    });
    return { executions, hasMore: rows.length === limit };
  }

  static async maxIdForAgentMessage(
    auth: Authenticator,
    { agentMessageModelId }: { agentMessageModelId: ModelId }
  ): Promise<ModelId> {
    const maxId = await this.model.max("id", {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentMessageId: agentMessageModelId,
      },
    });
    assert(
      typeof maxId === "number" && Number.isSafeInteger(maxId) && maxId > 0,
      "Consumption event is missing its committed Elasticsearch version"
    );
    return maxId;
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

  static async deleteOlderThan({
    cutoff,
    limit,
  }: {
    cutoff: Date;
    limit: number;
  }): Promise<number> {
    assert(limit > 0 && limit <= 10_000, "Invalid outbox cleanup batch size");
    // biome-ignore lint/plugin/noRawSql: PostgreSQL has no DELETE LIMIT; the CTE keeps each batch bounded.
    const [result] = await frontSequelize.query<{ deletedCount: number }>(
      `
        WITH victims AS (
          SELECT id
          FROM agent_message_consumption_events
          WHERE "createdAt" < $cutoff
            AND "processedAt" IS NOT NULL
          ORDER BY "createdAt", id
          LIMIT $limit
        ), deleted AS (
          DELETE FROM agent_message_consumption_events event
          USING victims
          WHERE event.id = victims.id
          RETURNING event.id
        )
        SELECT COUNT(*)::int AS "deletedCount" FROM deleted
      `,
      {
        bind: { cutoff, limit },
        type: QueryTypes.SELECT,
      }
    );
    return result?.deletedCount ?? 0;
  }

  async delete(): Promise<Result<undefined, Error>> {
    return new Err(
      new Error("Consumption events can only be deleted by retention cleanup")
    );
  }
}
