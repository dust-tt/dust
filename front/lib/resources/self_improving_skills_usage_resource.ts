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

export type SelfImprovingSkillsSpend = {
  // Raw provider cost. Includes the markup only when returned by a
  // `WithMarkup` method.
  priceMicroUsd: number;
  // ALWAYS includes the margin (it is baked into the AWU credit conversion,
  // see awuFromMicroUsd), whether or not the method is a `WithMarkup` one.
  priceAwuCredits: number;
};

// The markup only applies to the raw micro-USD cost; AWU credits already
// include the margin (see awuFromMicroUsd).
function applyMarkup(
  spend: SelfImprovingSkillsSpend
): SelfImprovingSkillsSpend {
  return {
    priceMicroUsd: spend.priceMicroUsd * MARKUP_MULTIPLIER,
    priceAwuCredits: spend.priceAwuCredits,
  };
}

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

  /**
   * Total workspace spend after the given date.
   *
   * `priceMicroUsd` is the raw provider cost, WITHOUT markup.
   * `priceAwuCredits` includes the margin (always baked into AWU credits).
   */
  static async getSumSpendAfterDate(
    auth: Authenticator,
    createdAfter: Date
  ): Promise<SelfImprovingSkillsSpend> {
    const rows = (await this.model.findAll({
      attributes: [
        [Sequelize.fn("SUM", Sequelize.col("priceMicroUsd")), "priceMicroUsd"],
        [
          Sequelize.fn("SUM", Sequelize.col("priceAwuCredits")),
          "priceAwuCredits",
        ],
      ],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        createdAt: { [Op.gt]: createdAfter },
      },
      raw: true,
    })) as unknown as {
      priceMicroUsd: string | null;
      priceAwuCredits: string | null;
    }[];

    return {
      priceMicroUsd: Number(rows[0]?.priceMicroUsd ?? 0),
      priceAwuCredits: Number(rows[0]?.priceAwuCredits ?? 0),
    };
  }

  /**
   * Total workspace spend after the given date, billable amounts.
   *
   * `priceMicroUsd` is the raw provider cost WITH the markup applied.
   * `priceAwuCredits` is identical to the non-markup variant: the margin is
   * always baked into AWU credits, so no markup is applied to it.
   */
  static async getSumSpendWithMarkupAfterDate(
    auth: Authenticator,
    createdAfter: Date
  ): Promise<SelfImprovingSkillsSpend> {
    return applyMarkup(await this.getSumSpendAfterDate(auth, createdAfter));
  }

  /**
   * Per-skill spend after the given date.
   *
   * `priceMicroUsd` is the raw provider cost, WITHOUT markup.
   * `priceAwuCredits` includes the margin (always baked into AWU credits).
   */
  static async getSumSpendAfterDateForSkills(
    auth: Authenticator,
    {
      createdAfter,
      skillModelIds,
    }: {
      createdAfter: Date;
      skillModelIds: ModelId[];
    }
  ): Promise<Map<ModelId, SelfImprovingSkillsSpend>> {
    const uniqueSkillIds = [...new Set(skillModelIds)];
    if (uniqueSkillIds.length === 0) {
      return new Map();
    }

    const rows = await this.model.findAll({
      attributes: [
        "skillId",
        [Sequelize.fn("SUM", Sequelize.col("priceMicroUsd")), "priceMicroUsd"],
        [
          Sequelize.fn("SUM", Sequelize.col("priceAwuCredits")),
          "priceAwuCredits",
        ],
      ],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        skillId: { [Op.in]: uniqueSkillIds },
        createdAt: { [Op.gt]: createdAfter },
      },
      group: ["skillId"],
    });

    return new Map(
      rows.map((row) => [
        row.skillId as ModelId,
        {
          priceMicroUsd: Number(row.priceMicroUsd),
          priceAwuCredits: Number(row.priceAwuCredits),
        },
      ])
    );
  }

  /**
   * Per-skill spend after the given date, billable amounts.
   *
   * `priceMicroUsd` is the raw provider cost WITH the markup applied.
   * `priceAwuCredits` is identical to the non-markup variant: the margin is
   * always baked into AWU credits, so no markup is applied to it.
   */
  static async getSumSpendWithMarkupAfterDateForSkills(
    auth: Authenticator,
    {
      createdAfter,
      skillModelIds,
    }: {
      createdAfter: Date;
      skillModelIds: ModelId[];
    }
  ): Promise<Map<ModelId, SelfImprovingSkillsSpend>> {
    const raw = await this.getSumSpendAfterDateForSkills(auth, {
      createdAfter,
      skillModelIds,
    });

    return new Map(
      [...raw.entries()].map(([id, spend]) => [id, applyMarkup(spend)])
    );
  }

  /**
   * Return total spend per calendar day (UTC) within a date range.
   *
   * Each entry maps an ISO date string ("YYYY-MM-DD") to the summed spend for
   * that day. Days with no spend are omitted.
   *
   * `priceMicroUsd` is the raw provider cost, WITHOUT markup.
   * `priceAwuCredits` includes the margin (always baked into AWU credits).
   */
  private static async getDailySpend(
    auth: Authenticator,
    {
      startDate,
      endDate,
    }: {
      startDate: Date;
      endDate: Date;
    }
  ): Promise<Map<string, SelfImprovingSkillsSpend>> {
    const dayExpr = Sequelize.fn(
      "DATE",
      Sequelize.cast(Sequelize.col("createdAt"), "TIMESTAMPTZ")
    );

    const rows = (await this.model.findAll({
      attributes: [
        [dayExpr, "day"],
        [Sequelize.fn("SUM", Sequelize.col("priceMicroUsd")), "priceMicroUsd"],
        [
          Sequelize.fn("SUM", Sequelize.col("priceAwuCredits")),
          "priceAwuCredits",
        ],
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
    })) as unknown as {
      day: string;
      priceMicroUsd: string;
      priceAwuCredits: string;
    }[];

    return new Map(
      rows.map((row) => [
        row.day,
        {
          priceMicroUsd: Number(row.priceMicroUsd),
          priceAwuCredits: Number(row.priceAwuCredits),
        },
      ])
    );
  }

  /**
   * Total spend per calendar day (UTC) within a date range, billable amounts.
   *
   * `priceMicroUsd` is the raw provider cost WITH the markup applied.
   * `priceAwuCredits` is identical to the non-markup variant: the margin is
   * always baked into AWU credits, so no markup is applied to it.
   */
  static async getDailySpendWithMarkup(
    auth: Authenticator,
    params: {
      startDate: Date;
      endDate: Date;
    }
  ): Promise<Map<string, SelfImprovingSkillsSpend>> {
    const raw = await this.getDailySpend(auth, params);

    return new Map(
      [...raw.entries()].map(([day, spend]) => [day, applyMarkup(spend)])
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
      priceAwuCredits: this.priceAwuCredits,
    };
  }
}
