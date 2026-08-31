import type {
  DegradedModelEndpointType,
  DegradedModelEndpointUpdateType,
} from "@app/lib/model_constructors/types/degradations";
import { BaseResource } from "@app/lib/resources/base_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { ModelDegradationModel } from "@app/lib/resources/storage/models/model_degradations";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Attributes, ModelStatic } from "sequelize";
import { Op } from "sequelize";

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
  static async listDegradedEndpoints(): Promise<DegradedModelEndpointType[]> {
    const rows = await ModelDegradationModel.findAll();

    return rows.map(({ modelId, providerId, host }) => ({
      modelId,
      providerId,
      host,
    }));
  }

  /**
   * Clears the rows of every endpoint the request names, then re-adds the ones
   * it wants degraded. Endpoints the request does not name are left alone, so
   * two operators working the same incident do not clobber each other.
   */
  static async updateDegradedEndpoints(
    updates: DegradedModelEndpointUpdateType[]
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
        where: { [Op.or]: named },
        transaction,
      });

      if (toDegrade.length > 0) {
        await ModelDegradationModel.bulkCreate(toDegrade, { transaction });
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
