import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { ProjectTodoTakeawaySourcesModel } from "@app/lib/resources/storage/models/project_todo_takeaway_sources";
import {
  TakeawaySourcesModel,
  TakeawaysModel,
} from "@app/lib/resources/storage/models/takeaways";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ModelId } from "@app/types/shared/model_id";
import { Ok, type Result } from "@app/types/shared/result";
import { md5 } from "@app/types/shared/utils/encryption";
import type {
  TodoVersionedActionItem,
  TodoVersionedKeyDecision,
  TodoVersionedNotableFact,
} from "@app/types/takeaways";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { col, fn, Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";

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

  static async makeNew(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<TakeawaysModel>,
      "workspaceId" | "version" | "sId"
    >,
    transaction?: Transaction
  ): Promise<TakeawaysResource> {
    const row = await TakeawaysModel.create(
      {
        ...blob,
        sId: generateRandomModelSId(),
        workspaceId: auth.getNonNullableWorkspace().id,
        version: 1,
      },
      { transaction }
    );

    return new this(TakeawaysModel, row.get());
  }

  // Appends a new version row for the given sId. An advisory lock scoped to the
  // (workspace, sId) pair is acquired to serialise concurrent butler runs and
  // prevent version-number races.
  static async createNewVersion(
    auth: Authenticator,
    sId: string,
    blob: Omit<
      CreationAttributes<TakeawaysModel>,
      "workspaceId" | "version" | "sId"
    >,
    transaction?: Transaction
  ): Promise<TakeawaysResource> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    return withTransaction(async (t) => {
      const hash = md5(`takeaways_version_${workspaceId}_${sId}`);
      const lockKey = parseInt(hash, 16) % 9999999999;
      // biome-ignore lint/plugin/noRawSql: advisory lock requires raw SQL
      await frontSequelize.query("SELECT pg_advisory_xact_lock(:key)", {
        transaction: t,
        replacements: { key: lockKey },
      });

      const maxVersionResult = await TakeawaysModel.findOne({
        where: { workspaceId, sId },
        attributes: [[fn("MAX", col("version")), "maxVersion"]],
        raw: true,
        transaction: t,
      });

      const nextVersion =
        ((maxVersionResult as { maxVersion: number | null } | null)
          ?.maxVersion ?? 0) + 1;

      const row = await TakeawaysModel.create(
        { ...blob, sId, workspaceId, version: nextVersion },
        { transaction: t }
      );

      return new this(TakeawaysModel, row.get());
    }, transaction);
  }

  // Returns the most recent snapshot for a given sId, or null if none exists.
  static async fetchLatestBySId(
    auth: Authenticator,
    { sId }: { sId: string },
    transaction?: Transaction
  ): Promise<TakeawaysResource | null> {
    const row = await TakeawaysModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        sId,
      },
      order: [["version", "DESC"]],
      transaction,
    });

    return row ? new this(TakeawaysModel, row.get()) : null;
  }

  // Returns all versioned snapshots for a given sId, oldest first.
  static async fetchAllBySId(
    auth: Authenticator,
    { sId }: { sId: string },
    transaction?: Transaction
  ): Promise<TakeawaysResource[]> {
    const rows = await TakeawaysModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        sId,
      },
      order: [["version", "ASC"]],
      transaction,
    });

    return rows.map((r) => new this(TakeawaysModel, r.get()));
  }

  // Returns a specific version for a given sId, or null if it does not exist.
  static async fetchBySIdAndVersion(
    auth: Authenticator,
    { sId, version }: { sId: string; version: number },
    transaction?: Transaction
  ): Promise<TakeawaysResource | null> {
    const row = await TakeawaysModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        sId,
        version,
      },
      transaction,
    });

    return row ? new this(TakeawaysModel, row.get()) : null;
  }

  // Deletes all takeaway rows for a specific space, along with their source
  // entries and the join-table rows that reference those sources.
  // Must be called before deleting project todos for the same space because
  // ProjectTodoTakeawaySourcesModel holds RESTRICT FKs on both sides.
  static async deleteAllForSpace(
    auth: Authenticator,
    { spaceModelId }: { spaceModelId: ModelId }
  ): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const takeaways = await TakeawaysModel.findAll({
      attributes: ["sId"],
      where: { workspaceId, spaceId: spaceModelId },
      raw: true,
    });
    const takeawaySIds = [...new Set(takeaways.map((r) => r.sId))];

    if (takeawaySIds.length > 0) {
      const takeawaySourceIds = (
        await TakeawaySourcesModel.findAll({
          attributes: ["id"],
          where: { workspaceId, takeawaySId: { [Op.in]: takeawaySIds } },
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
        where: { workspaceId, takeawaySId: { [Op.in]: takeawaySIds } },
      });
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
    await TakeawaysModel.destroy({ where: { workspaceId } });
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

  // Returns the latest takeaway snapshot for every conversation that has
  // produced a takeaway in the given space. Each entry pairs the most-recent
  // TakeawaysResource version with the conversation sId that produced it.
  // Used by the merge workflow to iterate over all conversations to process.
  static async fetchLatestBySpaceId(
    auth: Authenticator,
    { spaceModelId }: { spaceModelId: ModelId }
  ): Promise<{ takeaway: TakeawaysResource; conversationSId: string }[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    // Fetch all rows for this space ordered so the highest version per sId
    // comes first — the first occurrence is the latest version.
    const rows = await TakeawaysModel.findAll({
      where: { workspaceId, spaceId: spaceModelId },
      order: [
        ["sId", "ASC"],
        ["version", "DESC"],
      ],
    });

    // O(n) dedup — keep only the latest version per sId.
    const latestBySId = new Map<string, TakeawaysModel>();
    for (const row of rows) {
      if (!latestBySId.has(row.sId)) {
        latestBySId.set(row.sId, row);
      }
    }

    if (latestBySId.size === 0) {
      return [];
    }

    // Batch-fetch source rows to resolve each takeaway sId → conversation sId.
    const sIds = [...latestBySId.keys()];
    const sources = await TakeawaySourcesModel.findAll({
      where: {
        workspaceId,
        takeawaySId: { [Op.in]: sIds },
        sourceType: "conversation",
      },
    });

    // One source per takeaway sId (a takeaway is produced by one conversation).
    const conversationSIdBySId = new Map<string, string>(
      sources.map((s) => [s.takeawaySId, s.sourceId])
    );

    const result: { takeaway: TakeawaysResource; conversationSId: string }[] =
      [];
    for (const [sId, row] of latestBySId) {
      const conversationSId = conversationSIdBySId.get(sId);
      if (!conversationSId) {
        // Takeaway exists for this space but has no conversation source — skip.
        continue;
      }
      result.push({
        takeaway: new this(TakeawaysModel, row.get()),
        conversationSId,
      });
    }

    return result;
  }

  // Returns the most recent snapshot for a conversation, or null if none exists.
  // Looks up the conversation's stable sId through TakeawaySourcesModel.
  static async fetchLatestByConversationId(
    auth: Authenticator,
    { conversationId }: { conversationId: string },
    transaction?: Transaction
  ): Promise<TakeawaysResource | null> {
    const source = await TakeawaySourcesModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        sourceId: conversationId,
      },
      transaction,
    });
    if (!source) {
      return null;
    }
    return TakeawaysResource.fetchLatestBySId(
      auth,
      { sId: source.takeawaySId },
      transaction
    );
  }

  // Creates a new versioned snapshot for a conversation. The conversation's
  // stable takeaway sId is looked up (or created) via TakeawaySourcesModel.
  static async makeNewForConversation(
    auth: Authenticator,
    {
      conversationId,
      spaceId,
      actionItems,
      notableFacts,
      keyDecisions,
    }: {
      conversationId: string;
      spaceId: string;
      actionItems: TodoVersionedActionItem[];
      notableFacts: TodoVersionedNotableFact[];
      keyDecisions: TodoVersionedKeyDecision[];
    },
    transaction?: Transaction
  ): Promise<TakeawaysResource> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const spaceModelId = getResourceIdFromSId(spaceId);
    if (!spaceModelId) {
      throw new Error(`Invalid spaceId: ${spaceId}`);
    }

    return withTransaction(async (t) => {
      let source = await TakeawaySourcesModel.findOne({
        where: { workspaceId, sourceId: conversationId },
        transaction: t,
      });

      let sId: string;
      if (source) {
        sId = source.takeawaySId;
      } else {
        sId = uuidv4();
        await TakeawaySourcesModel.create(
          {
            workspaceId,
            takeawaySId: sId,
            sourceType: "conversation",
            sourceId: conversationId,
          },
          { transaction: t }
        );
      }

      return TakeawaysResource.makeNew(
        auth,
        { spaceId: spaceModelId, actionItems, notableFacts, keyDecisions },
        t
      );
    }, transaction);
  }
}
