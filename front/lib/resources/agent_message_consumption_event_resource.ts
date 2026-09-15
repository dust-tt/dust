import type { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionEventModel } from "@app/lib/models/agent/agent_message_consumption_event";
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
      consumptionMode: EnabledAgentMessageConsumptionMode;
    }
  | {
      kind: "execution_finalized";
      idempotencyKey: string;
      runKey: string;
      rootAgentMessageId: ModelId;
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
    { event }: { event: ConsumptionEvent }
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
          consumptionMode: null,
        };
      }

      case "execution_started": {
        return {
          ...commonAttributes,
          kind: event.kind,
          consumptionItemIds: null,
          status: null,
          consumptionMode: event.consumptionMode,
        };
      }

      case "execution_finalized": {
        return {
          ...commonAttributes,
          kind: event.kind,
          consumptionItemIds: null,
          status: event.status,
          consumptionMode: event.consumptionMode,
        };
      }

      default:
        return assertNever(event);
    }
  }

  /**
   * @cc [owner:id13,label:backend;concurrency] transactional-outbox-append
   * Event creation MUST use the supplied transaction so the event commits or rolls back atomically
   * with the consumption mutations that caused it.
   */
  /**
   * @cc [owner:id13,label:backend;error-handling] immutable-event-idempotency
   * Within a workspace, an idempotency key identifies exactly one event payload. Retrying the same
   * payload MUST return the existing event; reusing the key for a different payload MUST fail.
   */
  static async append(
    auth: Authenticator,
    {
      event,
      transaction,
    }: { event: ConsumptionEvent; transaction: Transaction }
  ): Promise<AgentMessageConsumptionEventResource> {
    const attributes = this.creationAttributes(auth, { event });
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
        consumptionMode: row.consumptionMode,
      },
      {
        agentMessageId: attributes.agentMessageId,
        runKey: attributes.runKey,
        rootAgentMessageId: attributes.rootAgentMessageId,
        kind: attributes.kind,
        consumptionItemIds: attributes.consumptionItemIds,
        status: attributes.status,
        consumptionMode: attributes.consumptionMode,
      },
      "A consumption event key cannot identify different events"
    );
    return new this(this.model, row.get());
  }

  /**
   * @cc [owner:id13,label:backend;concurrency] ordered-pending-event-batch
   * The requested limit MUST be between 1 and 1,000. The result MUST contain at most that many
   * unprocessed events for the requested workspace and run, ordered by ascending event ID.
   */
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

  /**
   * @cc [owner:id13,label:backend;product] latest-started-execution-snapshot
   * The lookup MUST return the root agent message ID and consumption mode from the highest-ID
   * execution-started event for the requested workspace and agent message. It MUST return `null`
   * when that event is absent or has no consumption mode.
   */
  static async fetchLatestExecutionStartedForAgentMessage(
    auth: Authenticator,
    { agentMessageModelId }: { agentMessageModelId: ModelId }
  ): Promise<{
    rootAgentMessageId: ModelId;
    consumptionMode: EnabledAgentMessageConsumptionMode;
  } | null> {
    const row = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentMessageId: agentMessageModelId,
        kind: "execution_started",
      },
      order: [["id", "DESC"]],
    });
    if (row === null || row.consumptionMode === null) {
      return null;
    }

    return {
      rootAgentMessageId: row.rootAgentMessageId,
      consumptionMode: row.consumptionMode,
    };
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

  /**
   * @cc [owner:id13,label:backend;concurrency] monotonic-event-acknowledgement
   * Acknowledgement MUST set `processedAt` on every currently unprocessed requested event ModelId
   * belonging to the requested workspace and run. Retries, already processed events, and ModelIds
   * from another scope MUST remain unchanged.
   */
  static async markProcessed(
    auth: Authenticator,
    {
      runKey,
      eventModelIds,
      processedAt,
    }: {
      runKey: string;
      eventModelIds: ModelId[];
      processedAt: Date;
    }
  ): Promise<number> {
    assert(
      eventModelIds.length > 0 && eventModelIds.length <= 1_000,
      "Invalid consumption event acknowledgement batch size"
    );
    const [updatedCount] = await this.model.update(
      { processedAt },
      {
        validate: false,
        where: {
          id: { [Op.in]: eventModelIds },
          workspaceId: auth.getNonNullableWorkspace().id,
          runKey,
          processedAt: null,
        },
      }
    );
    return updatedCount;
  }

  /**
   * @cc [owner:id13,label:backend;concurrency] bounded-global-recovery-scan
   * The unauthenticated recovery scan MUST inspect at most the requested number of oldest pending
   * rows globally, return at most one entry per workspace and run in that window, and derive
   * `hasMore` from whether the raw row window reached the limit.
   */
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

  /**
   * @cc [owner:id13,label:backend] committed-projection-version
   * The projection version MUST be the greatest committed event ID for the requested workspace and
   * agent message, and the lookup MUST fail when no such event exists.
   */
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

  /**
   * @cc [owner:id13,label:backend] processed-event-retention
   * Retention cleanup MUST delete at most the requested number of processed events created before
   * the cutoff, oldest first, and MUST NOT delete an unprocessed event.
   */
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

  /**
   * @cc [owner:id13,label:backend] retention-owned-deletion
   * Individual resource deletion MUST fail; persisted events may be removed only by explicit agent
   * message or workspace teardown methods, or by bounded retention cleanup.
   */
  async delete(): Promise<Result<undefined, Error>> {
    return new Err(
      new Error("Consumption events can only be deleted by retention cleanup")
    );
  }
}
