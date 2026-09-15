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
    const rows = await ModelDegradationModel.findAll({
      where: {
        source,
        [Op.or]: [
          { expiresAt: null },
          {
            expiresAt: {
              [Op.gt]: now,
            },
          },
        ],
      },
    });

    return rows.map(({ modelId, providerId, host }) => ({
      modelId,
      providerId,
      host,
    }));
  }

  /**
   * @cc [owner:frankaloia,label:backend] isolate-degradation-sources
   * Updating an endpoint for one source MUST NOT create or delete degradation state owned by
   * another source.
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
