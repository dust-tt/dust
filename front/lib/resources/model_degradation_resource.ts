import type {
  DegradedModelEndpointType,
  DegradedModelEndpointUpdateType,
} from "@app/lib/model_constructors/types/degradations";
import { BaseResource } from "@app/lib/resources/base_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { ModelDegradationSource } from "@app/lib/resources/storage/models/model_degradations";
import { ModelDegradationModel } from "@app/lib/resources/storage/models/model_degradations";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Attributes, ModelStatic } from "sequelize";
import { Op } from "sequelize";

type ModelDegradationUpdateOptions = {
  source?: ModelDegradationSource;
  expiresAt?: Date | null;
};

type ModelDegradationListOptions = {
  source?: ModelDegradationSource;
  now?: Date;
};

type ModelDegradationRecordListOptions = {
  source?: ModelDegradationSource;
  now?: Date;
  includeExpired?: boolean;
};

export type ModelDegradationRecord = DegradedModelEndpointType & {
  source: ModelDegradationSource;
  expiresAt: Date | null;
  updatedAt: Date;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ModelDegradationResource
  extends ReadonlyAttributesType<ModelDegradationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ModelDegradationResource extends BaseResource<ModelDegradationModel> {
  static model: ModelStatic<ModelDegradationModel> = ModelDegradationModel;

  constructor(
    model: ModelStatic<ModelDegradationModel>,
    blob: Attributes<ModelDegradationModel>
  ) {
    super(ModelDegradationModel, blob);
  }

  // Bounded by the endpoint catalog: at most a few dozen rows.
  /**
   * @cc [owner:frankaloia,label:backend] only-list-active-degradations
   * Listing a source MUST NOT return its degradation rows whose `expiresAt` is in the past.
   */
  static async listDegradedEndpoints({
    source = "manual",
    now = new Date(),
  }: ModelDegradationListOptions = {}): Promise<DegradedModelEndpointType[]> {
    const rows = await this.listDegradationRecords({ source, now });

    return rows.map(({ modelId, providerId, host }) => ({
      modelId,
      providerId,
      host,
    }));
  }

  static async listDegradationRecords({
    source,
    now = new Date(),
    includeExpired = false,
  }: ModelDegradationRecordListOptions = {}): Promise<
    ModelDegradationRecord[]
  > {
    const activeWhere = includeExpired
      ? {}
      : {
          [Op.or]: [
            { expiresAt: null },
            {
              expiresAt: {
                [Op.gt]: now,
              },
            },
          ],
        };
    const rows = await ModelDegradationModel.findAll({
      where: {
        ...(source ? { source } : {}),
        ...activeWhere,
      },
    });

    return rows.map(
      ({ modelId, providerId, host, source, expiresAt, updatedAt }) => ({
        modelId,
        providerId,
        host,
        source,
        expiresAt,
        updatedAt,
      })
    );
  }

  /**
   * @cc [owner:frankaloia,label:backend;concurrency] monotonic-automatic-degradation-renewal
   * Renewing an automatic degradation MUST NOT shorten its existing expiration.
   */
  static async renewAutomaticDegradation(
    endpoint: DegradedModelEndpointType,
    expiresAt: Date
  ): Promise<Date> {
    const identity = {
      ...endpoint,
      source: "automatic" as const,
    };

    // A conditional update keeps renewals monotonic. If recovery deletes the
    // row between the read and update, loop once more and recreate it.
    for (let attempt = 0; attempt < 3; attempt++) {
      const [row, created] = await ModelDegradationModel.findOrCreate({
        where: identity,
        defaults: {
          ...identity,
          expiresAt,
        },
      });

      if (created || (row.expiresAt && row.expiresAt >= expiresAt)) {
        return row.expiresAt ?? expiresAt;
      }

      const [updated] = await ModelDegradationModel.update(
        { expiresAt },
        {
          where: {
            id: row.id,
            [Op.or]: [
              { expiresAt: null },
              {
                expiresAt: {
                  [Op.lt]: expiresAt,
                },
              },
            ],
          },
        }
      );

      if (updated > 0) {
        return expiresAt;
      }

      const current = await ModelDegradationModel.findOne({
        where: identity,
      });
      if (current?.expiresAt && current.expiresAt >= expiresAt) {
        return current.expiresAt;
      }
    }

    throw new Error("Failed to renew automatic model degradation.");
  }

  static async getAutomaticDegradationExpiresAt(
    endpoint: DegradedModelEndpointType,
    now: Date = new Date()
  ): Promise<Date | null> {
    const row = await ModelDegradationModel.findOne({
      where: {
        ...endpoint,
        source: "automatic",
        expiresAt: {
          [Op.gt]: now,
        },
      },
    });

    return row?.expiresAt ?? null;
  }

  /**
   * @cc [owner:frankaloia,label:backend;concurrency] conditional-automatic-degradation-clear
   * Clearing an automatic degradation MUST NOT delete a lease renewed beyond the expiration
   * observed by the recovery attempt.
   */
  static async clearAutomaticDegradation(
    endpoint: DegradedModelEndpointType,
    observedExpiresAt: Date
  ): Promise<boolean> {
    const deleted = await ModelDegradationModel.destroy({
      where: {
        ...endpoint,
        source: "automatic",
        expiresAt: {
          [Op.lte]: observedExpiresAt,
        },
      },
    });

    return deleted > 0;
  }

  /**
   * @cc [owner:frankaloia,label:backend] isolate-degradation-sources
   * Updating an endpoint for one source MUST NOT create or delete degradation state owned by
   * another source.
   */
  /**
   * @cc [owner:frankaloia,label:product] degradation-expiration-by-source
   * Manual degradation rows MUST NOT expire, and newly degraded automatic rows MUST have an
   * expiration.
   */
  static async updateDegradedEndpoints(
    updates: DegradedModelEndpointUpdateType[],
    { source = "manual", expiresAt = null }: ModelDegradationUpdateOptions = {}
  ): Promise<void> {
    // An empty `Op.or` below would clear the whole table.
    if (updates.length === 0) {
      return;
    }

    const endpointOf = ({
      modelId,
      providerId,
      host,
    }: DegradedModelEndpointUpdateType): DegradedModelEndpointType => ({
      modelId,
      providerId,
      host,
    });

    const named = updates.map(endpointOf);
    const toDegrade = updates
      .filter(({ degraded }) => degraded)
      .map(endpointOf);

    if (source === "manual" && expiresAt !== null) {
      throw new Error("Manual model degradations cannot expire.");
    }
    if (source === "automatic" && toDegrade.length > 0 && expiresAt === null) {
      throw new Error("Automatic model degradations require an expiration.");
    }

    await frontSequelize.transaction(async (transaction) => {
      await ModelDegradationModel.destroy({
        where: {
          [Op.or]: named,
          source,
        },
        transaction,
      });

      if (toDegrade.length > 0) {
        await ModelDegradationModel.bulkCreate(
          toDegrade.map((endpoint) => ({
            ...endpoint,
            source,
            expiresAt,
          })),
          { transaction }
        );
      }
    });
  }

  async delete(): Promise<Result<number | undefined, Error>> {
    await this.model.destroy({
      where: {
        id: this.id,
      },
    });

    return new Ok(this.id);
  }
}
