import type { Attributes, ModelStatic, Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { FeatureFlagModel } from "@app/lib/models/feature_flag";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type {
  LightWorkspaceType,
  Result,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";
import { Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FeatureFlagResource extends ReadonlyAttributesType<FeatureFlagModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class FeatureFlagResource extends BaseResource<FeatureFlagModel> {
  static model: ModelStatic<FeatureFlagModel> = FeatureFlagModel;

  constructor(
    model: ModelStatic<FeatureFlagModel>,
    blob: Attributes<FeatureFlagModel>
  ) {
    super(FeatureFlagModel, blob);
  }

  static async listForWorkspace(
    workspace: WorkspaceResource | WorkspaceType | LightWorkspaceType
  ): Promise<FeatureFlagResource[]> {
    const flags = await FeatureFlagModel.findAll({
      where: { workspaceId: workspace.id },
    });

    return flags.map((f) => new FeatureFlagResource(FeatureFlagModel, f.get()));
  }

  static async isEnabledForWorkspace(
    workspace: WorkspaceResource | WorkspaceType,
    name: WhitelistableFeature
  ): Promise<boolean> {
    const flag = await FeatureFlagModel.findOne({
      where: {
        workspaceId: workspace.id,
        name,
      },
    });

    return flag !== null;
  }

  static async enable(
    workspace: WorkspaceResource | WorkspaceType | LightWorkspaceType,
    name: WhitelistableFeature
  ): Promise<void> {
    await FeatureFlagModel.create({
      workspaceId: workspace.id,
      name,
    });
  }

  static async disable(
    workspace: WorkspaceResource | WorkspaceType | LightWorkspaceType,
    name: WhitelistableFeature
  ): Promise<boolean> {
    const count = await FeatureFlagModel.destroy({
      where: {
        workspaceId: workspace.id,
        name,
      },
    });

    return count > 0;
  }

  static async enableMany(
    workspace: WorkspaceResource | WorkspaceType | LightWorkspaceType,
    names: WhitelistableFeature[]
  ): Promise<void> {
    const existingFlags = await FeatureFlagModel.findAll({
      where: { workspaceId: workspace.id },
    });

    const existingNames = new Set(existingFlags.map((f) => f.name));
    const toCreate = names.filter((name) => !existingNames.has(name));

    if (toCreate.length > 0) {
      await FeatureFlagModel.bulkCreate(
        toCreate.map((name) => ({
          workspaceId: workspace.id,
          name,
        }))
      );
    }
  }

  static async disableMany(
    workspace: WorkspaceResource | WorkspaceType | LightWorkspaceType,
    names: WhitelistableFeature[]
  ): Promise<void> {
    await FeatureFlagModel.destroy({
      where: {
        workspaceId: workspace.id,
        name: names,
      },
    });
  }

  static async deleteAllForWorkspace(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    await FeatureFlagModel.destroy({
      where: { workspaceId: workspace.id },
      transaction,
    });
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
}
