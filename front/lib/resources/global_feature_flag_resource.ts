import type { Authenticator } from "@app/lib/auth";
import { GlobalFeatureFlagModel } from "@app/lib/models/global_feature_flag";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

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

  static async listAll(): Promise<GlobalFeatureFlagResource[]> {
    const flags = await GlobalFeatureFlagModel.findAll();

    return flags.map(
      (f) => new GlobalFeatureFlagResource(GlobalFeatureFlagModel, f.get())
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
  }

  async delete(
    _auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<number | undefined, Error>> {
    await this.model.destroy({
      where: { id: this.id },
      transaction,
    });

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
