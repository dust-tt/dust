import { defineCachedResourceList } from "@app/lib/api/resources/cached_resource_lookup";
import type { Authenticator } from "@app/lib/auth";
import { FeatureFlagModel } from "@app/lib/models/feature_flag";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { isWhitelistableFeature } from "@app/types/shared/feature_flags";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { RequestCachedQuery } from "@app/types/shared/utils/request_context";
import type { LightWorkspaceType, WorkspaceType } from "@app/types/user";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

// Feature flags are a stable snapshot for the request. Mutations become
// visible on the next request.
const listForWorkspaceQuery = new RequestCachedQuery<
  ModelId,
  FeatureFlagResource[]
>();

const FEATURE_FLAG_CACHE_VERSION = 1;

type CachedFeatureFlagData = {
  id: ModelId;
  workspaceId: ModelId;
  name: WhitelistableFeature;
  createdAt: number;
  updatedAt: number;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FeatureFlagResource
  extends ReadonlyAttributesType<FeatureFlagModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class FeatureFlagResource extends BaseResource<FeatureFlagModel> {
  static model: ModelStatic<FeatureFlagModel> = FeatureFlagModel;

  constructor(
    model: ModelStatic<FeatureFlagModel>,
    blob: Attributes<FeatureFlagModel>
  ) {
    super(FeatureFlagModel, blob);
  }

  private static async listForWorkspaceFromDatabase(
    workspaceModelId: ModelId,
    transaction?: Transaction
  ): Promise<FeatureFlagResource[]> {
    const flags = await FeatureFlagModel.findAll({
      where: { workspaceId: workspaceModelId },
      transaction,
    });

    return flags
      .map((flag) => new FeatureFlagResource(FeatureFlagModel, flag.get()))
      .filter((flag) => isWhitelistableFeature(flag.name));
  }

  private static readonly listForWorkspaceCache = defineCachedResourceList<
    ModelId,
    CachedFeatureFlagData[],
    FeatureFlagResource
  >({
    id: "feature_flags_by_workspace",
    version: FEATURE_FLAG_CACHE_VERSION,
    key: (workspaceModelId) => String(workspaceModelId),
    loadFromDatabase: FeatureFlagResource.listForWorkspaceFromDatabase,
    toSnapshot: (flags) =>
      flags.map((flag) => ({
        id: flag.id,
        workspaceId: flag.workspaceId,
        name: flag.name,
        createdAt: flag.createdAt.getTime(),
        updatedAt: flag.updatedAt.getTime(),
      })),
    fromSnapshot: (flags) =>
      flags.map(
        (flag) =>
          new FeatureFlagResource(FeatureFlagModel, {
            id: flag.id,
            workspaceId: flag.workspaceId,
            name: flag.name,
            createdAt: new Date(flag.createdAt),
            updatedAt: new Date(flag.updatedAt),
          })
      ),
  });

  static async listForWorkspace(
    workspace: WorkspaceResource | WorkspaceType | LightWorkspaceType
  ): Promise<FeatureFlagResource[]> {
    return listForWorkspaceQuery.get(workspace.id, () =>
      FeatureFlagResource.listForWorkspaceCache.fetch(workspace.id)
    );
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
    await FeatureFlagResource.listForWorkspaceCache.invalidate(workspace.id);
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
    await FeatureFlagResource.listForWorkspaceCache.invalidate(workspace.id);
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
      await FeatureFlagResource.listForWorkspaceCache.invalidate(workspace.id);
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
    await FeatureFlagResource.listForWorkspaceCache.invalidate(workspace.id);
  }

  static async disableForAllWorkspaces(
    name: WhitelistableFeature
  ): Promise<number> {
    const flags = await FeatureFlagModel.findAll({
      attributes: ["workspaceId"],
      where: { name },
      // WORKSPACE_ISOLATION_BYPASS: this maintenance operation intentionally disables one flag across all workspaces.
      // @ts-expect-error -- Cross-workspace query by design.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });
    const workspaceModelIds = Array.from(
      new Set(flags.map((flag) => flag.workspaceId))
    );

    const deleted = await FeatureFlagModel.destroy({
      where: { name },
      // WORKSPACE_ISOLATION_BYPASS: this maintenance operation intentionally disables one flag across all workspaces.
      // @ts-expect-error -- Cross-workspace mutation by design.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    await concurrentExecutor(
      workspaceModelIds,
      (workspaceModelId) =>
        FeatureFlagResource.listForWorkspaceCache.invalidate(workspaceModelId),
      { concurrency: 16 }
    );

    return deleted;
  }

  static async countForAllWorkspaces(
    name: WhitelistableFeature
  ): Promise<number> {
    return FeatureFlagModel.count({ where: { name } });
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
    await FeatureFlagResource.listForWorkspaceCache.invalidate(
      workspace.id,
      transaction
    );
  }

  // Count/delete rows for a flag name that is no longer in WHITELISTABLE_FEATURES.
  static async countLegacyByName(name: string): Promise<number> {
    return FeatureFlagModel.count({ where: { name } });
  }

  static async deleteLegacyByName(name: string): Promise<number> {
    return FeatureFlagModel.destroy({ where: { name } });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<number | undefined, Error>> {
    await this.model.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
    await FeatureFlagResource.listForWorkspaceCache.invalidate(
      this.workspaceId,
      transaction
    );
    return new Ok(this.id);
  }
}
