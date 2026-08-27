import { BaseResource } from "@app/lib/resources/base_resource";
import { ModelDegradationModel } from "@app/lib/resources/storage/models/model_degradations";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Attributes, ModelStatic } from "sequelize";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.

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

  /**
   * Marks a model degraded, or returns the degradation already ongoing for it.
   *
   * Idempotent so an operator submitting the same set twice does not open a
   * second row; the partial unique index enforces the same invariant in the
   * database.
   */
  static async startDegradation({
    modelId,
    providerId,
  }: {
    modelId: string;
    providerId: ModelProviderIdType;
  }): Promise<ModelDegradationResource> {
    const ongoing = await ModelDegradationModel.findOne({
      where: { modelId, status: "ongoing" },
    });
    if (ongoing) {
      return new ModelDegradationResource(ModelDegradationModel, ongoing.get());
    }

    const degradation = await ModelDegradationModel.create({
      modelId,
      providerId,
      startedAt: new Date(),
      endedAt: null,
      status: "ongoing",
    });

    return new ModelDegradationResource(
      ModelDegradationModel,
      degradation.get()
    );
  }

  /**
   * Closes the degradation ongoing for a model, if any. A no-op when the model
   * is not currently degraded.
   */
  static async resolveDegradation(modelId: string): Promise<void> {
    await ModelDegradationModel.update(
      { endedAt: new Date(), status: "resolved" },
      { where: { modelId, status: "ongoing" } }
    );
  }

  static async listOngoing(): Promise<ModelDegradationResource[]> {
    const degradations = await ModelDegradationModel.findAll({
      where: { status: "ongoing" },
    });

    return degradations.map(
      (d) => new ModelDegradationResource(ModelDegradationModel, d.get())
    );
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
