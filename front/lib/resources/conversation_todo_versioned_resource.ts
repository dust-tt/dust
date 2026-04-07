import type { Authenticator } from "@app/lib/auth";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { ConversationTodoVersionedModel } from "@app/lib/resources/storage/models/conversation_todo_versioned";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ModelId } from "@app/types/shared/model_id";
import { Ok, type Result } from "@app/types/shared/result";
import { md5 } from "@app/types/shared/utils/encryption";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { col, fn, Op } from "sequelize";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ConversationTodoVersionedResource
  extends ReadonlyAttributesType<ConversationTodoVersionedModel> {}

const MAX_JSONB_SIZE_BYTES = 4_096;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ConversationTodoVersionedResource extends BaseResource<ConversationTodoVersionedModel> {
  static model: ModelStaticWorkspaceAware<ConversationTodoVersionedModel> =
    ConversationTodoVersionedModel;

  constructor(
    model: ModelStatic<ConversationTodoVersionedModel>,
    blob: Attributes<ConversationTodoVersionedModel>
  ) {
    super(ConversationTodoVersionedModel, blob);
  }

  // Creates a new versioned snapshot for the conversation. The version is
  // determined by incrementing the current maximum version for that
  // conversation. An advisory lock scoped to the conversation is acquired
  // first to serialise concurrent butler runs, matching the same pattern used
  // for message version increments.
  static async makeNew(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<ConversationTodoVersionedModel>,
      "workspaceId" | "version"
    >,
    transaction?: Transaction
  ): Promise<ConversationTodoVersionedResource> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const jsonbSizeBytes =
      Buffer.byteLength(JSON.stringify(blob.actionItems)) +
      Buffer.byteLength(JSON.stringify(blob.notableFacts)) +
      Buffer.byteLength(JSON.stringify(blob.keyDecisions)) +
      Buffer.byteLength(JSON.stringify(blob.agentSuggestions));

    if (jsonbSizeBytes > MAX_JSONB_SIZE_BYTES) {
      throw new Error(
        `ConversationTodoVersionedResource.makeNew: JSONB payload exceeds 4 KB (${jsonbSizeBytes} bytes).`
      );
    }

    return withTransaction(async (t) => {
      // Advisory lock scoped to this conversation to prevent concurrent
      // version bumps from racing each other (same pattern as
      // getConversationRankVersionLock in conversation.ts).
      const hash = md5(`conversation_todo_version_${blob.conversationId}`);
      const lockKey = parseInt(hash, 16) % 9999999999;
      // biome-ignore lint/plugin/noRawSql: advisory lock requires raw SQL
      await frontSequelize.query("SELECT pg_advisory_xact_lock(:key)", {
        transaction: t,
        replacements: { key: lockKey },
      });

      const maxVersionResult = await ConversationTodoVersionedModel.findOne({
        where: { workspaceId, conversationId: blob.conversationId },
        attributes: [[fn("MAX", col("version")), "maxVersion"]],
        raw: true,
        transaction: t,
      });

      const nextVersion =
        ((maxVersionResult as { maxVersion: number | null } | null)
          ?.maxVersion ?? 0) + 1;

      const row = await ConversationTodoVersionedModel.create(
        { ...blob, workspaceId, version: nextVersion },
        { transaction: t }
      );

      return new this(ConversationTodoVersionedModel, row.get());
    }, transaction);
  }

  // Returns the most recent snapshot for a conversation, or null if none exists.
  static async fetchLatestByConversation(
    auth: Authenticator,
    { conversationId }: { conversationId: ModelId },
    transaction?: Transaction
  ): Promise<ConversationTodoVersionedResource | null> {
    const row = await ConversationTodoVersionedModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId,
      },
      order: [["version", "DESC"]],
      transaction,
    });

    return row ? new this(ConversationTodoVersionedModel, row.get()) : null;
  }

  // Returns all versioned snapshots for a conversation, oldest first.
  static async fetchAllByConversation(
    auth: Authenticator,
    { conversationId }: { conversationId: ModelId },
    transaction?: Transaction
  ): Promise<ConversationTodoVersionedResource[]> {
    const rows = await ConversationTodoVersionedModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId,
      },
      order: [["version", "ASC"]],
      transaction,
    });

    return rows.map((r) => new this(ConversationTodoVersionedModel, r.get()));
  }

  // Returns a specific version for a conversation, or null if it does not exist.
  static async fetchByConversationAndVersion(
    auth: Authenticator,
    { conversationId, version }: { conversationId: ModelId; version: number },
    transaction?: Transaction
  ): Promise<ConversationTodoVersionedResource | null> {
    const row = await ConversationTodoVersionedModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId,
        version,
      },
      transaction,
    });

    return row ? new this(ConversationTodoVersionedModel, row.get()) : null;
  }

  // Returns the latest ConversationTodoVersioned snapshot for each active
  // (non-deleted, non-test) conversation in the given space. Used by the
  // project merge algorithm to scan all relevant conversation activity.
  static async fetchLatestForSpace(
    auth: Authenticator,
    { spaceModelId }: { spaceModelId: ModelId }
  ): Promise<ConversationTodoVersionedResource[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    // Step 1: Find all active conversations in the space.
    const conversations = await ConversationModel.findAll({
      where: {
        workspaceId,
        spaceId: spaceModelId,
        visibility: { [Op.notIn]: ["deleted", "test"] },
      },
      attributes: ["id"],
    });

    if (conversations.length === 0) {
      return [];
    }

    const conversationIds = conversations.map((c) => c.id);

    // Step 2: Fetch all versioned snapshots for those conversations ordered by
    // (conversationId ASC, version DESC) so the first occurrence per
    // conversationId is the latest snapshot.
    const rows = await ConversationTodoVersionedModel.findAll({
      where: {
        workspaceId,
        conversationId: { [Op.in]: conversationIds },
      },
      order: [
        ["conversationId", "ASC"],
        ["version", "DESC"],
      ],
    });

    // Deduplicate: keep the first (highest version) snapshot per conversation.
    const latestByConversationId = new Map<
      ModelId,
      ConversationTodoVersionedResource
    >();
    for (const row of rows) {
      if (!latestByConversationId.has(row.conversationId)) {
        latestByConversationId.set(
          row.conversationId,
          new this(ConversationTodoVersionedModel, row.get())
        );
      }
    }

    return Array.from(latestByConversationId.values());
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
      transaction,
    });

    return new Ok(undefined);
  }

  get sId(): string {
    return ConversationTodoVersionedResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("conversation_todo_versioned", { id, workspaceId });
  }
}
