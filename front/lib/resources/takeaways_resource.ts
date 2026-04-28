import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ProjectTodoTakeawaySourcesModel } from "@app/lib/resources/storage/models/project_todo_takeaway_sources";
import {
  TakeawaySourcesModel,
  TakeawaysModel,
  TakeawaysVersionModel,
} from "@app/lib/resources/storage/models/takeaways";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  ProjectTodoSourceInfo,
  ProjectTodoSourceType,
} from "@app/types/project_todo";
import type { ModelId } from "@app/types/shared/model_id";
import { Ok, type Result } from "@app/types/shared/result";
import type { TodoVersionedActionItem } from "@app/types/takeaways";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

export type TakeawaySourceDocument = {
  title: string;
  text: string;
  id: string;
  type: ProjectTodoSourceType;
  uri: string;
};

export type TakeawaysWithSource = {
  takeaway: TakeawaysResource;
  source: ProjectTodoSourceInfo;
};

type TakeawaysVersionCreationAttributes = CreationAttributes<TakeawaysModel> & {
  takeawaysId: ModelId;
  version: number;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface TakeawaysResource
  extends ReadonlyAttributesType<TakeawaysModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TakeawaysResource extends BaseResource<TakeawaysModel> {
  static model: ModelStaticWorkspaceAware<TakeawaysModel> = TakeawaysModel;

  constructor(
    model: ModelStatic<TakeawaysModel>,
    blob: Attributes<TakeawaysModel>
  ) {
    super(TakeawaysModel, blob);
  }

  // The stable string identifier for this takeaway, computed from the model's
  // integer id. External code must use this sId — never the raw model id.
  get sId(): string {
    return TakeawaysResource.modelIdToSId({
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
    return makeSId("takeaways", { id, workspaceId });
  }

  // ── Creation ────────────────────────────────────────────────────────────────

  static async makeNew(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<TakeawaysModel>,
      "workspaceId" | "notableFacts" | "keyDecisions"
    >,
    transaction?: Transaction
  ): Promise<TakeawaysResource> {
    return withTransaction(async (t) => {
      const row = await TakeawaysModel.create(
        {
          ...blob,
          workspaceId: auth.getNonNullableWorkspace().id,
          notableFacts: [],
          keyDecisions: [],
        },
        { transaction: t }
      );

      return new this(TakeawaysModel, row.get());
    }, transaction);
  }

  // Saves the current content as a version snapshot, then updates the main row
  // in place. The version number is determined by the existing snapshot count + 1.
  async updateWithVersion(
    auth: Authenticator,
    updates: Pick<CreationAttributes<TakeawaysModel>, "actionItems">,
    transaction?: Transaction
  ): Promise<TakeawaysResource> {
    if (this.workspaceId !== auth.getNonNullableWorkspace().id) {
      throw new Error("Workspace mismatch in updateWithVersion.");
    }

    return withTransaction(async (t) => {
      await this.saveVersion(t);
      await this.update(updates, t);

      return this;
    }, transaction);
  }

  // Appends a snapshot of the current content to the version table.
  // Called before every in-place update of the main row.
  private async saveVersion(transaction?: Transaction): Promise<void> {
    const where: WhereOptions<TakeawaysVersionModel> = {
      workspaceId: this.workspaceId,
      takeawaysId: this.id,
    };

    const existingCount = await TakeawaysVersionModel.count({
      where,
      transaction,
    });

    const versionData: TakeawaysVersionCreationAttributes = {
      workspaceId: this.workspaceId,
      takeawaysId: this.id,
      version: existingCount + 1,
      spaceId: this.spaceId,
      actionItems: this.actionItems,
      notableFacts: this.notableFacts,
      keyDecisions: this.keyDecisions,
    };
    await TakeawaysVersionModel.create(versionData, { transaction });
  }

  // ── Fetching ─────────────────────────────────────────────────────────────────
  private static async _fetchById(
    auth: Authenticator,
    id: ModelId,
    transaction?: Transaction
  ): Promise<TakeawaysResource | null> {
    const row = await TakeawaysModel.findOne({
      where: {
        id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    return row ? new this(TakeawaysModel, row.get()) : null;
  }

  // ── Space-level bulk operations ──────────────────────────────────────────────

  // Deletes all takeaway rows for a specific space, along with their source
  // entries, version snapshots, and the join-table rows that reference those
  // sources. Must be called before deleting project todos for the same space
  // because ProjectTodoTakeawaySourcesModel holds RESTRICT FKs on both sides.
  static async deleteAllForSpace(
    auth: Authenticator,
    { spaceModelId }: { spaceModelId: ModelId }
  ): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const takeawayIds = (
      await TakeawaysModel.findAll({
        attributes: ["id"],
        where: { workspaceId, spaceId: spaceModelId },
        raw: true,
      })
    ).map((r) => r.id);

    if (takeawayIds.length > 0) {
      const takeawaySourceIds = (
        await TakeawaySourcesModel.findAll({
          attributes: ["id"],
          where: { workspaceId, takeawaysId: { [Op.in]: takeawayIds } },
        })
      ).map((r) => r.id);

      if (takeawaySourceIds.length > 0) {
        await ProjectTodoTakeawaySourcesModel.destroy({
          where: {
            workspaceId,
            takeawaySourceId: { [Op.in]: takeawaySourceIds },
          },
        });
      }

      await TakeawaySourcesModel.destroy({
        where: { workspaceId, takeawaysId: { [Op.in]: takeawayIds } },
      });

      const versionWhere: WhereOptions<TakeawaysVersionModel> = {
        workspaceId,
        takeawaysId: { [Op.in]: takeawayIds },
      };
      await TakeawaysVersionModel.destroy({ where: versionWhere });
    }

    await TakeawaysModel.destroy({
      where: { workspaceId, spaceId: spaceModelId },
    });
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    // Delete join-table rows first to avoid RESTRICT FK violations.
    const takeawaySourceIds = (
      await TakeawaySourcesModel.findAll({
        attributes: ["id"],
        where: { workspaceId },
      })
    ).map((r) => r.id);

    if (takeawaySourceIds.length > 0) {
      await ProjectTodoTakeawaySourcesModel.destroy({
        where: { workspaceId, takeawaySourceId: takeawaySourceIds },
      });
    }

    await TakeawaySourcesModel.destroy({ where: { workspaceId } });
    await TakeawaysVersionModel.destroy({ where: { workspaceId } });
    await TakeawaysModel.destroy({ where: { workspaceId } });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const takeawaySourceIds = (
      await TakeawaySourcesModel.findAll({
        attributes: ["id"],
        where: { workspaceId, takeawaysId: this.id },
        transaction,
      })
    ).map((r) => r.id);

    if (takeawaySourceIds.length > 0) {
      await ProjectTodoTakeawaySourcesModel.destroy({
        where: {
          workspaceId,
          takeawaySourceId: { [Op.in]: takeawaySourceIds },
        },
        transaction,
      });
    }

    await TakeawaySourcesModel.destroy({
      where: { workspaceId, takeawaysId: this.id },
      transaction,
    });

    const versionWhere: WhereOptions<TakeawaysVersionModel> = {
      workspaceId,
      takeawaysId: this.id,
    };
    await TakeawaysVersionModel.destroy({ where: versionWhere, transaction });

    await this.model.destroy({
      where: { workspaceId, id: this.id },
      transaction,
    });

    return new Ok(undefined);
  }

  // ── Conversation-scoped helpers ──────────────────────────────────────────────

  // Returns the latest takeaway snapshot for every source that has
  // produced a takeaway in the given space. Each entry pairs the
  // TakeawaysResource with the source sId that produced it.
  // Used by the merge workflow to iterate over all sources to process.
  static async fetchLatestBySpaceId(
    auth: Authenticator,
    { spaceModelId }: { spaceModelId: ModelId }
  ): Promise<TakeawaysWithSource[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const rows = await TakeawaysModel.findAll({
      where: { workspaceId, spaceId: spaceModelId },
    });

    if (rows.length === 0) {
      return [];
    }

    const takeawayIds = rows.map((r) => r.id);
    const sources = await TakeawaySourcesModel.findAll({
      where: {
        workspaceId,
        takeawaysId: { [Op.in]: takeawayIds },
      },
    });

    // One source per takeaway (a takeaway is produced by one source).
    const sourceByTakeawaysId = new Map<ModelId, ProjectTodoSourceInfo>(
      sources.map((s) => [
        s.takeawaysId,
        {
          sourceType: s.sourceType,
          sourceId: s.sourceId,
          sourceTitle: s.sourceTitle,
          sourceUrl: s.sourceUrl,
        },
      ])
    );

    const result: TakeawaysWithSource[] = [];
    for (const row of rows) {
      const source = sourceByTakeawaysId.get(row.id);
      if (!source) {
        // Takeaway exists for this space but has no source — skip.
        continue;
      }
      result.push({
        takeaway: new this(TakeawaysModel, row.get()),
        source,
      });
    }

    return result;
  }

  // Return the take away for a give source id and type, or null if none exists.
  static async fetchLatestBySourceIdAndType(
    auth: Authenticator,
    {
      sourceId,
      sourceType,
    }: { sourceId: string; sourceType: ProjectTodoSourceType },
    transaction?: Transaction
  ): Promise<TakeawaysResource | null> {
    const source = await TakeawaySourcesModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        sourceId,
        sourceType,
      },
      transaction,
    });
    if (!source) {
      return null;
    }
    return TakeawaysResource._fetchById(auth, source.takeawaysId, transaction);
  }

  // Returns the takeaway for a given conversation, or null if none exists.
  // Looks up the conversation via TakeawaySourcesModel.
  static async fetchLatestByConversationId(
    auth: Authenticator,
    { conversationId }: { conversationId: string },
    transaction?: Transaction
  ): Promise<TakeawaysResource | null> {
    return this.fetchLatestBySourceIdAndType(
      auth,
      {
        sourceId: conversationId,
        sourceType: "project_conversation",
      },
      transaction
    );
  }

  static async makeNewForDocument(
    auth: Authenticator,
    {
      spaceId,
      document,
      actionItems,
    }: {
      spaceId: string;
      document: {
        id: string;
        type: ProjectTodoSourceType;
        title: string | null;
        uri: string | null;
      };
      actionItems: TodoVersionedActionItem[];
    },
    transaction?: Transaction
  ): Promise<TakeawaysResource> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const spaceModelId = getResourceIdFromSId(spaceId);
    if (!spaceModelId) {
      throw new Error(`Invalid spaceId: ${spaceId}`);
    }

    return withTransaction(async (t) => {
      const source = await TakeawaySourcesModel.findOne({
        where: {
          workspaceId,
          sourceId: document.id,
          sourceType: document.type,
        },
        transaction: t,
      });

      if (source) {
        const existing = await TakeawaysResource._fetchById(
          auth,
          source.takeawaysId,
          t
        );
        if (!existing) {
          throw new Error(
            `TakeawaysModel row missing for takeawaysId ${source.takeawaysId}`
          );
        }
        return existing.updateWithVersion(auth, { actionItems }, t);
      }

      const takeaway = await TakeawaysResource.makeNew(
        auth,
        { spaceId: spaceModelId, actionItems },
        t
      );

      await TakeawaySourcesModel.create(
        {
          workspaceId,
          takeawaysId: takeaway.id,
          sourceType: document.type,
          sourceId: document.id,
          sourceTitle: document.title,
          sourceUrl: document.uri,
        },
        { transaction: t }
      );

      return takeaway;
    }, transaction);
  }

  // Creates or updates the takeaway for a conversation. If no takeaway exists
  // for this conversation yet, a new TakeawaysModel row and source link are
  // created. Otherwise the existing row is updated in place with a version
  // snapshot appended to TakeawaysVersionModel.
  static async makeNewForConversation(
    auth: Authenticator,
    {
      conversationId,
      spaceId,
      actionItems,
    }: {
      conversationId: string;
      spaceId: string;
      actionItems: TodoVersionedActionItem[];
    },
    transaction?: Transaction
  ): Promise<TakeawaysResource> {
    return this.makeNewForDocument(
      auth,
      {
        spaceId,
        document: {
          id: conversationId,
          type: "project_conversation",
          title: null,
          uri: null,
        },
        actionItems,
      },
      transaction
    );
  }
}
