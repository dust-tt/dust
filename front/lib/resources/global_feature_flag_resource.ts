import type { Authenticator } from "@app/lib/auth";
import { GlobalFeatureFlagModel } from "@app/lib/models/global_feature_flag";
import { BaseResource } from "@app/lib/resources/base_resource";
import { defineCachedResourceList } from "@app/lib/resources/cached_resource_store";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { RequestCachedQuery } from "@app/types/shared/utils/request_context";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

// Feature flags are a stable snapshot for the request. Mutations become
// visible on the next request.
const listAllQuery = new RequestCachedQuery<
  "all",
  GlobalFeatureFlagResource[]
>();

const GLOBAL_FEATURE_FLAG_CACHE_VERSION = 1;

type CachedGlobalFeatureFlagData = {
  id: ModelId;
  name: WhitelistableFeature;
  rolloutPercentage: number;
  createdAt: number;
  updatedAt: number;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface GlobalFeatureFlagResource
  extends ReadonlyAttributesType<GlobalFeatureFlagModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class GlobalFeatureFlagResource extends BaseResource<GlobalFeatureFlagModel> {
  static model: ModelStatic<GlobalFeatureFlagModel> = GlobalFeatureFlagModel;

  constructor(
    model: ModelStatic<GlobalFeatureFlagModel>,
    blob: Attributes<GlobalFeatureFlagModel>
  ) {
    super(GlobalFeatureFlagModel, blob);
  }

  private static async listAllFromDatabase(
    _key: "all",
    transaction?: Transaction
  ): Promise<GlobalFeatureFlagResource[]> {
    const flags = await GlobalFeatureFlagModel.findAll({ transaction });

    return flags.map(
      (flag) =>
        new GlobalFeatureFlagResource(GlobalFeatureFlagModel, flag.get())
    );
  }

  private static readonly listAllCache = defineCachedResourceList<
    "all",
    CachedGlobalFeatureFlagData[],
    GlobalFeatureFlagResource
  >({
    id: "global_feature_flags",
    version: GLOBAL_FEATURE_FLAG_CACHE_VERSION,
    key: (key) => key,
    loadFromDatabase: GlobalFeatureFlagResource.listAllFromDatabase,
    toSnapshot: (flags) =>
      flags.map((flag) => ({
        id: flag.id,
        name: flag.name,
        rolloutPercentage: flag.rolloutPercentage,
        createdAt: flag.createdAt.getTime(),
        updatedAt: flag.updatedAt.getTime(),
      })),
    fromSnapshot: (flags) =>
      flags.map(
        (flag) =>
          new GlobalFeatureFlagResource(GlobalFeatureFlagModel, {
            id: flag.id,
            name: flag.name,
            rolloutPercentage: flag.rolloutPercentage,
            createdAt: new Date(flag.createdAt),
            updatedAt: new Date(flag.updatedAt),
          })
      ),
  });

  static async listAll(): Promise<GlobalFeatureFlagResource[]> {
    return listAllQuery.get("all", () =>
      GlobalFeatureFlagResource.listAllCache.fetch("all")
    );
  }

  static async setRolloutPercentage(
    name: WhitelistableFeature,
    rolloutPercentage: number
  ): Promise<void> {
    if (rolloutPercentage < 0 || rolloutPercentage > 100) {
      throw new Error(
        `Invalid rollout percentage: ${rolloutPercentage}. Must be between 0 and 100.`
      );
    }

    if (rolloutPercentage === 0) {
      await GlobalFeatureFlagModel.destroy({ where: { name } });
    } else {
      await GlobalFeatureFlagModel.upsert({ name, rolloutPercentage });
    }
    await GlobalFeatureFlagResource.listAllCache.invalidate("all");
  }

  async delete(
    _auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<number | undefined, Error>> {
    await this.model.destroy({
      where: { id: this.id },
      transaction,
    });
    await GlobalFeatureFlagResource.listAllCache.invalidate("all", transaction);
    return new Ok(this.id);
  }

  /**
   * Deterministic check: given a workspace numeric ID and rollout percentage,
   * returns whether the workspace falls within the rollout.
   *
   * The bucket is derived solely from the workspace ID, so all flags at a
   * given percentage cover the exact same set of workspaces. This is useful if
   * a feature involves multiple flags.
   *
   * Properties:
   * - Deterministic: same workspace always gets the same result.
   * - Monotonic: if included at 10%, still included at 20%.
   * - Uniform across flags: a workspace in the 10% bucket is in it for every flag.
   */
  static isInRollout(workspaceId: number, rolloutPercentage: number): boolean {
    if (rolloutPercentage <= 0) {
      return false;
    }
    if (rolloutPercentage >= 100) {
      return true;
    }
    return workspaceId % 100 < rolloutPercentage;
  }
}
