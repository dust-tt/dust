import type { Result } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { Subscription } from "@app/lib/models/plan";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SubscriptionResource
  extends ReadonlyAttributesType<Subscription> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SubscriptionResource extends BaseResource<Subscription> {
  static model: ModelStatic<Subscription> = Subscription;

  constructor(
    model: ModelStatic<Subscription>,
    blob: Attributes<Subscription>
  ) {
    super(Subscription, blob);
  }

  static async makeNew(blob: CreationAttributes<Subscription>) {
    const subscription = await Subscription.create({ ...blob });
    return new SubscriptionResource(Subscription, subscription.get());
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        id: this.id,
      },
      transaction,
    });
    return new Ok(undefined);
  }
}
