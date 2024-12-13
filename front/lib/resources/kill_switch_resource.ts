import type { Result } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic } from "sequelize";

import type { KillSwitchType } from "@app/lib/poke/types";
import { BaseResource } from "@app/lib/resources/base_resource";
import { KillSwitchModel } from "@app/lib/resources/storage/models/kill_switches";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface KillSwitchResource
  extends ReadonlyAttributesType<KillSwitchModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class KillSwitchResource extends BaseResource<KillSwitchModel> {
  static model: ModelStatic<KillSwitchModel> = KillSwitchModel;

  constructor(
    model: ModelStatic<KillSwitchModel>,
    blob: Attributes<KillSwitchModel>
  ) {
    super(KillSwitchModel, blob);
  }

  static async enableKillSwitch(
    type: KillSwitchType
  ): Promise<KillSwitchResource> {
    const ks =
      (await KillSwitchModel.findOne({
        where: {
          type,
        },
      })) ?? (await KillSwitchModel.create({ type }));

    return new KillSwitchResource(KillSwitchModel, ks.get());
  }

  static async disableKillSwitch(type: KillSwitchType): Promise<void> {
    await KillSwitchModel.destroy({
      where: {
        type,
      },
    });
  }

  static async list(): Promise<KillSwitchResource[]> {
    const killSwitches = await KillSwitchModel.findAll();
    return killSwitches.map(
      (ks) => new KillSwitchResource(KillSwitchModel, ks.get())
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
