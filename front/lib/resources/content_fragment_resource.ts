import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Attributes, CreationAttributes, ModelStatic } from "sequelize";

import { BaseResource } from "@app/lib/resources/base_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ContentFragmentResource
  extends ReadonlyAttributesType<ContentFragmentModel> {}
export class ContentFragmentResource extends BaseResource<ContentFragmentModel> {
  static model: ModelStatic<ContentFragmentModel> = ContentFragmentModel;

  // TODO(2024-02-20 flav): Delete Model from the constructor, once `update` has been migrated.
  constructor(blob: Attributes<ContentFragmentModel>) {
    super(ContentFragmentModel, blob);
  }

  static async makeNew(blob: CreationAttributes<ContentFragmentModel>) {
    return frontSequelize.transaction(async (transaction) => {
      const contentFragment = await ContentFragmentModel.create(
        {
          ...blob,
        },
        { transaction }
      );

      return new this(contentFragment.get());
    });
  }

  async delete(): Promise<Result<undefined, Error>> {
    return frontSequelize.transaction(async (transaction) => {
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
    });
  }
}
