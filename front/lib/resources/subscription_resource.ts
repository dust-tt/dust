import { Authenticator } from "@app/lib/auth";
import { Subscription } from "@app/lib/models/plan";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { Ok, Result } from "@dust-tt/types";
import { Attributes, CreationAttributes, ModelStatic, Transaction } from "sequelize";

export interface SubscriptionResource extends ReadonlyAttributesType<Subscription> {}

export class SubscriptionResource extends BaseResource<Subscription> {
    static model: ModelStatic<Subscription> = Subscription;

    constructor(model: ModelStatic<Subscription>, blob: Attributes<Subscription>) {
        super(Subscription, blob);
    }

    static async makeNew(blob: CreationAttributes<Subscription>) {
        const subscription = await Subscription.create({...blob});
        return new SubscriptionResource(Subscription, subscription.get());
    }

    async delete(
        auth: Authenticator,
        { transaction }: { transaction?: Transaction } = {}
      ): Promise<Result<undefined, Error>> {
        await this.model.destroy({
          where: {
            id: this.id
        },
          transaction,
        });
        return new Ok(undefined);
      }
}