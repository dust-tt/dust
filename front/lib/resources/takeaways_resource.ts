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
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { Ok, type Result } from "@app/types/shared/result";
import { md5 } from "@app/types/shared/utils/encryption";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { col, fn } from "sequelize";

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
}
