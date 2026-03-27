import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ConversationTodoSnapshotModel } from "@app/lib/resources/storage/models/conversation_todo_snapshot";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ModelId } from "@app/types/shared/model_id";
import { Ok, type Result } from "@app/types/shared/result";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { col, fn } from "sequelize";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ConversationTodoSnapshotResource
  extends ReadonlyAttributesType<ConversationTodoSnapshotModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ConversationTodoSnapshotResource extends BaseResource<ConversationTodoSnapshotModel> {
  static model: ModelStaticWorkspaceAware<ConversationTodoSnapshotModel> =
    ConversationTodoSnapshotModel;

  constructor(
    model: ModelStatic<ConversationTodoSnapshotModel>,
    blob: Attributes<ConversationTodoSnapshotModel>
  ) {
    super(ConversationTodoSnapshotModel, blob);
  }

  // Creates a new versioned snapshot for the conversation. The version is
  // determined by incrementing the current maximum version for that
  // conversation. Must be called inside a transaction to be safe against
  // concurrent runs.
  static async makeNew(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<ConversationTodoSnapshotModel>,
      "workspaceId" | "version"
    >,
    transaction: Transaction
  ): Promise<ConversationTodoSnapshotResource> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const maxVersionResult = await ConversationTodoSnapshotModel.findOne({
      where: { workspaceId, conversationId: blob.conversationId },
      attributes: [[fn("MAX", col("version")), "maxVersion"]],
      raw: true,
      transaction,
    });

    const nextVersion =
      ((maxVersionResult as { maxVersion: number | null } | null)?.maxVersion ??
        0) + 1;

    const row = await ConversationTodoSnapshotModel.create(
      { ...blob, workspaceId, version: nextVersion },
      { transaction }
    );

    return new this(ConversationTodoSnapshotModel, row.get());
  }

  // Returns the most recent snapshot for a conversation, or null if none exists.
  static async fetchLatestByConversation(
    auth: Authenticator,
    { conversationId }: { conversationId: ModelId },
    transaction?: Transaction
  ): Promise<ConversationTodoSnapshotResource | null> {
    const row = await ConversationTodoSnapshotModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId,
      },
      order: [["version", "DESC"]],
      transaction,
    });

    return row ? new this(ConversationTodoSnapshotModel, row.get()) : null;
  }

  // Returns all versioned snapshots for a conversation, oldest first.
  static async fetchAllByConversation(
    auth: Authenticator,
    { conversationId }: { conversationId: ModelId },
    transaction?: Transaction
  ): Promise<ConversationTodoSnapshotResource[]> {
    const rows = await ConversationTodoSnapshotModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId,
      },
      order: [["version", "ASC"]],
      transaction,
    });

    return rows.map((r) => new this(ConversationTodoSnapshotModel, r.get()));
  }

  // Returns a specific version for a conversation, or null if it does not
  // exist.
  static async fetchByConversationAndVersion(
    auth: Authenticator,
    { conversationId, version }: { conversationId: ModelId; version: number },
    transaction?: Transaction
  ): Promise<ConversationTodoSnapshotResource | null> {
    const row = await ConversationTodoSnapshotModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId,
        version,
      },
      transaction,
    });

    return row ? new this(ConversationTodoSnapshotModel, row.get()) : null;
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
    return ConversationTodoSnapshotResource.modelIdToSId({
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
    return makeSId("conversation_todo_snapshot", { id, workspaceId });
  }
}
