import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import { BaseResource } from "@app/lib/resources/base_resource";
import { TemplateModel } from "@app/lib/resources/storage/models/templates";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface TemplateResource
  extends ReadonlyAttributesType<TemplateModel> {}
export class TemplateResource extends BaseResource<TemplateModel> {
  static model: ModelStatic<TemplateModel> = TemplateModel;

  constructor(
    model: ModelStatic<TemplateModel>,
    blob: Attributes<TemplateModel>
  ) {
    super(TemplateModel, blob);
  }

  static async makeNew(blob: CreationAttributes<TemplateModel>) {
    const template = await TemplateModel.create({
      ...blob,
    });

    return new this(TemplateModel, template.get());
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }
}
