import type { Authenticator } from "@app/lib/auth";
import type { MentionStatusType } from "@app/lib/models/agent/conversation";
import { MentionModel } from "@app/lib/models/agent/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op, QueryTypes } from "sequelize";

export interface AgentIdleRow {
  agentId: string;
  lastMentionedAt: Date | null;
}

// Narrowed rather than asserted, per [GEN4]. A failing row is dropped rather than trusted.
function isAgentIdleRow(row: unknown): row is AgentIdleRow {
  if (typeof row !== "object" || row === null) {
    return false;
  }

  if (!("agentId" in row) || !("lastMentionedAt" in row)) {
    return false;
  }

  return (
    typeof row.agentId === "string" &&
    (row.lastMentionedAt === null || row.lastMentionedAt instanceof Date)
  );
}

export interface FindMentionByUserParams {
  messageModelIds: ModelId[];
  userModelId: ModelId;
  status?: MentionStatusType;
  transaction?: Transaction;
}

export interface ListMentionsByMessagesParams {
  messageModelIds: ModelId[];
  userModelId?: ModelId;
  agentConfigurationId?: string;
  status?: MentionStatusType;
  transaction?: Transaction;
  // Takes a `FOR UPDATE` lock on the matched rows. Requires a transaction.
  forUpdate?: boolean;
}

export interface UpdateMentionStatusParams {
  status: MentionStatusType;
  transaction?: Transaction;
}

export interface DeleteMentionsByMessagesParams {
  messageModelIds: ModelId[];
  transaction?: Transaction;
}

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MentionResource extends ReadonlyAttributesType<MentionModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MentionResource extends BaseResource<MentionModel> {
  static model: ModelStatic<MentionModel> = MentionModel;

  constructor(
    model: ModelStatic<MentionModel>,
    blob: Attributes<MentionModel>
  ) {
    super(MentionModel, blob);
  }

  static async makeNew(
    blob: CreationAttributes<MentionModel>,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<MentionResource> {
    const mention = await this.model.create(blob, { transaction });

    return new this(this.model, mention.get());
  }

  /**
   * The mention of this user across the given messages, optionally narrowed to one status, or null.
   */
  static async findByMessagesAndUser(
    auth: Authenticator,
    {
      messageModelIds,
      userModelId,
      status,
      transaction,
    }: FindMentionByUserParams
  ): Promise<MentionResource | null> {
    if (messageModelIds.length === 0) {
      return null;
    }

    const mention = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        messageId: { [Op.in]: messageModelIds },
        userId: userModelId,
        ...(status ? { status } : {}),
      },
      transaction,
    });

    return mention ? new this(this.model, mention.get()) : null;
  }

  /**
   * The mentions carried by the given messages, optionally narrowed to one user, one agent, and/or
   * one status.
   */
  static async listByMessageModelIds(
    auth: Authenticator,
    {
      messageModelIds,
      userModelId,
      agentConfigurationId,
      status,
      transaction,
      forUpdate,
    }: ListMentionsByMessagesParams
  ): Promise<MentionResource[]> {
    if (messageModelIds.length === 0) {
      return [];
    }

    const mentions = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        messageId: { [Op.in]: messageModelIds },
        ...(userModelId !== undefined ? { userId: userModelId } : {}),
        ...(agentConfigurationId !== undefined ? { agentConfigurationId } : {}),
        ...(status ? { status } : {}),
      },
      transaction,
      ...(transaction && forUpdate ? { lock: transaction.LOCK.UPDATE } : {}),
    });

    return mentions.map((mention) => new this(this.model, mention.get()));
  }

  /**
   * The workspace's active agents not mentioned since `notMentionedSince`, with when each last was.
   *
   * Global agents cannot appear: they have no row in `agent_configurations`. Every mention counts,
   * whatever its status.
   */
  static async listAgentsNotMentionedSince(
    auth: Authenticator,
    { notMentionedSince }: { notMentionedSince: Date }
  ): Promise<AgentIdleRow[]> {
    // Driven by the agents, of which there are far fewer than mentions.
    // biome-ignore lint/plugin/noRawSql: needs a LATERAL, which the query builder cannot express.
    const rows: unknown[] = await frontSequelize.query(
      `
        SELECT
          agent."sId" AS "agentId",
          last_mention."lastMentionedAt" AS "lastMentionedAt"
        FROM agent_configurations agent
        LEFT JOIN LATERAL (
          SELECT MAX(mention."createdAt") AS "lastMentionedAt"
          FROM mentions mention
          WHERE mention."workspaceId" = agent."workspaceId"
            AND mention."agentConfigurationId" = agent."sId"
        ) last_mention ON true
        WHERE agent."workspaceId" = $workspaceId
          AND agent.status = 'active'
          AND (
            last_mention."lastMentionedAt" IS NULL
            OR last_mention."lastMentionedAt" < $notMentionedSince
          )
        ORDER BY agent."sId"
      `,
      {
        type: QueryTypes.SELECT,
        bind: {
          workspaceId: auth.getNonNullableWorkspace().id,
          notMentionedSince,
        },
      }
    );

    const agents = rows.filter(isAgentIdleRow);
    if (agents.length !== rows.length) {
      logger.warn(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          droppedCount: rows.length - agents.length,
        },
        "Dropped unrecognized rows while listing agents not mentioned since"
      );
    }

    return agents;
  }

  /**
   * Moves this mention to `status`. The payload restates this mention's own `userId` /
   * `agentConfigurationId`: the model's `beforeValidate` hook requires exactly one of them non-null,
   * and Sequelize validates against the payload alone, even for a single-row update.
   */
  async updateStatus(
    auth: Authenticator,
    { status, transaction }: UpdateMentionStatusParams
  ): Promise<void> {
    await this.applyUpdate(auth, { status }, transaction);

    // Keep the in-memory attributes in step with the row, as `BaseResource.update` does: callers
    // render the mention off this instance right after moving its status.
    Object.assign(this, { status });
  }

  /**
   * Hides a restricted mention from the conversation without resolving it either way.
   */
  async dismiss(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await this.applyUpdate(auth, { dismissed: true }, transaction);

    Object.assign(this, { dismissed: true });
  }

  private async applyUpdate(
    auth: Authenticator,
    values: Partial<Attributes<MentionModel>>,
    transaction: Transaction | undefined
  ): Promise<void> {
    await MentionResource.model.update(
      {
        ...values,
        userId: this.userId,
        agentConfigurationId: this.agentConfigurationId,
      },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: this.id,
        },
        transaction,
      }
    );
  }

  static async deleteByMessageModelIds(
    auth: Authenticator,
    { messageModelIds, transaction }: DeleteMentionsByMessagesParams
  ): Promise<number> {
    if (messageModelIds.length === 0) {
      return 0;
    }

    return this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        messageId: { [Op.in]: messageModelIds },
      },
      transaction,
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<number, Error>> {
    const deletedCount = await MentionModel.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      } as WhereOptions<MentionModel>,
      transaction,
    });

    return new Ok(deletedCount);
  }
}
