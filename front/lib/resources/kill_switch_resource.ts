import type { KillSwitchType } from "@app/lib/poke/types";
import { BaseResource } from "@app/lib/resources/base_resource";
import { KillSwitchModel } from "@app/lib/resources/storage/models/kill_switches";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Attributes, ModelStatic } from "sequelize";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging

const KILL_SWITCH_ENABLED_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const KILL_SWITCH_ENABLED_CACHE_KEY = "kill_switches_enabled";

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

  private static listEnabledKillSwitchesCached = cacheWithRedis(
    KillSwitchResource._listEnabledKillSwitchesUncached,
    () => KILL_SWITCH_ENABLED_CACHE_KEY,
    { ttlMs: KILL_SWITCH_ENABLED_CACHE_TTL_MS }
  );

  private static invalidateKillSwitchCache = invalidateCacheWithRedis(
    KillSwitchResource._listEnabledKillSwitchesUncached,
    () => KILL_SWITCH_ENABLED_CACHE_KEY
  );

  static async enableKillSwitch(
    type: KillSwitchType
  ): Promise<KillSwitchResource> {
    const ks =
      (await KillSwitchModel.findOne({
        where: {
          type,
        },
      })) ?? (await KillSwitchModel.create({ type }));

    await KillSwitchResource.invalidateKillSwitchCache();

    return new KillSwitchResource(KillSwitchModel, ks.get());
  }

  static async disableKillSwitch(type: KillSwitchType): Promise<void> {
    await KillSwitchModel.destroy({
      where: {
        type,
      },
    });

    await KillSwitchResource.invalidateKillSwitchCache();
  }

  private static async _listEnabledKillSwitchesUncached(): Promise<
    KillSwitchType[]
  > {
    const killSwitches = await KillSwitchModel.findAll();
    return killSwitches.map((ks) => ks.type);
  }

  static async listEnabledKillSwitches(): Promise<KillSwitchType[]> {
    return KillSwitchResource.listEnabledKillSwitchesCached();
  }

  static async isKillSwitchEnabled(
    type: KillSwitchType
  ): Promise<boolean> {
    const enabledKillSwitches =
      await KillSwitchResource.listEnabledKillSwitches();
    return enabledKillSwitches.includes(type);
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
