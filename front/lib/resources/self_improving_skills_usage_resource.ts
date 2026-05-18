import { MARKUP_MULTIPLIER } from "@app/lib/api/programmatic_usage/common";
import type { Authenticator } from "@app/lib/auth";
import { SelfImprovingSkillsUsageModel } from "@app/lib/models/skill/self_improving_skills_usage";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";
import { Op, Sequelize } from "sequelize";

export type SelfImprovingSkillsUsageCreateBlob = Omit<
  CreationAttributes<SelfImprovingSkillsUsageModel>,
  "workspaceId"
>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SelfImprovingSkillsUsageResource
  extends ReadonlyAttributesType<SelfImprovingSkillsUsageModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SelfImprovingSkillsUsageResource extends BaseResource<SelfImprovingSkillsUsageModel> {
  static model: ModelStaticWorkspaceAware<SelfImprovingSkillsUsageModel> =
    SelfImprovingSkillsUsageModel;

  constructor(
    _model: ModelStaticWorkspaceAware<SelfImprovingSkillsUsageModel>,
    blob: Attributes<SelfImprovingSkillsUsageModel>
  ) {
    super(SelfImprovingSkillsUsageModel, blob);
  }

  static async bulkCreate(
    auth: Authenticator,
    blobs: SelfImprovingSkillsUsageCreateBlob[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<SelfImprovingSkillsUsageResource[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const usages = await this.model.bulkCreate(
      blobs.map((blob) => ({
        ...blob,
        workspaceId,
      })),
      { returning: true, transaction }
    );

    return usages.map((usage) => new this(this.model, usage.get()));
  }

  /**
   * Replace all usage rows for a known set of conversations.
   *
   * This is intended for idempotent recomputation: Temporal activities can be
   * retried, and using append-only bulkCreate would double-count costs. The
   * conversation IDs are passed separately from `usages` so callers can clear
   * stale rows even when the recomputed usage set is empty.
   */
  static async replaceForConversations(
    auth: Authenticator,
    {
      conversationModelIds,
      usages,
    }: {
      conversationModelIds: ModelId[];
      usages: SelfImprovingSkillsUsageCreateBlob[];
    }
  ): Promise<SelfImprovingSkillsUsageResource[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const uniqueConversationModelIds = [...new Set(conversationModelIds)];

    return withTransaction(async (transaction: Transaction) => {
      if (uniqueConversationModelIds.length > 0) {
        await this.model.destroy({
          where: {
            workspaceId,
            conversationId: { [Op.in]: uniqueConversationModelIds },
          },
          transaction,
        });
      }

      if (usages.length === 0) {
        return [];
      }

      return this.bulkCreate(auth, usages, { transaction });
    });
  }

  static async getSumPriceMicroUsdAfterDate(
    auth: Authenticator,
    createdAfter: Date
  ): Promise<number> {
    const sum = await this.model.sum("priceMicroUsd", {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        createdAt: { [Op.gt]: createdAfter },
      },
    });

    return sum ?? 0;
  }

  static async getSumPriceMicroUsdWithMarkupAfterDate(
    auth: Authenticator,
    createdAfter: Date
  ): Promise<number> {
    return (
      (await this.getSumPriceMicroUsdAfterDate(auth, createdAfter)) *
      MARKUP_MULTIPLIER
    );
  }

  static async getSumPriceMicroUsdAfterDateForSkills(
    auth: Authenticator,
    {
      createdAfter,
      skillModelIds,
    }: {
      createdAfter: Date;
      skillModelIds: ModelId[];
    }
  ): Promise<Map<ModelId, number>> {
    const uniqueSkillIds = [...new Set(skillModelIds)];
    if (uniqueSkillIds.length === 0) {
      return new Map();
    }

    const rows = await this.model.findAll({
      attributes: [
        "skillId",
        [Sequelize.fn("SUM", Sequelize.col("priceMicroUsd")), "priceMicroUsd"],
      ],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        skillId: { [Op.in]: uniqueSkillIds },
        createdAt: { [Op.gt]: createdAfter },
      },
      group: ["skillId"],
    });

    return new Map(
      rows.map((row) => [row.skillId as ModelId, Number(row.priceMicroUsd)])
    );
  }

  static async getSumPriceMicroUsdWithMarkupAfterDateForSkills(
    auth: Authenticator,
    {
      createdAfter,
      skillModelIds,
    }: {
      createdAfter: Date;
      skillModelIds: ModelId[];
    }
  ): Promise<Map<ModelId, number>> {
    const raw = await this.getSumPriceMicroUsdAfterDateForSkills(auth, {
      createdAfter,
      skillModelIds,
    });

    return new Map(
      [...raw.entries()].map(([id, value]) => [id, value * MARKUP_MULTIPLIER])
    );
  }

  /**
   * Return total spend per calendar day (UTC) within a date range.
   *
   * Each entry maps an ISO date string ("YYYY-MM-DD") to the summed spend in
   * micro-USD for that day. Days with no spend are omitted.
   */
  private static async getDailySpendMicroUsd(
    auth: Authenticator,
    {
      startDate,
      endDate,
    }: {
      startDate: Date;
      endDate: Date;
    }
  ): Promise<Map<string, number>> {
    const dayExpr = Sequelize.fn(
      "DATE",
      Sequelize.cast(Sequelize.col("createdAt"), "TIMESTAMPTZ")
    );

    const rows = (await this.model.findAll({
      attributes: [
        [dayExpr, "day"],
        [Sequelize.fn("SUM", Sequelize.col("priceMicroUsd")), "priceMicroUsd"],
      ],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        createdAt: {
          [Op.gte]: startDate,
          [Op.lt]: endDate,
        },
      },
      group: [dayExpr],
      order: [[dayExpr, "ASC"]],
      raw: true,
    })) as unknown as { day: string; priceMicroUsd: string }[];

    return new Map(rows.map((row) => [row.day, Number(row.priceMicroUsd)]));
  }

  static async getDailySpendMicroUsdWithMarkup(
    auth: Authenticator,
    params: {
      startDate: Date;
      endDate: Date;
    }
  ): Promise<Map<string, number>> {
    const raw = await this.getDailySpendMicroUsd(auth, params);

    return new Map(
      [...raw.entries()].map(([day, value]) => [day, value * MARKUP_MULTIPLIER])
    );
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    return new Ok(undefined);
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  toLogJSON() {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      skillId: this.skillId,
      conversationId: this.conversationId,
      priceMicroUsd: this.priceMicroUsd,
    };
  }
}
