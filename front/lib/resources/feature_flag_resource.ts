import type { Authenticator } from "@app/lib/auth";
import { FeatureFlagModel } from "@app/lib/models/feature_flag";
import { BaseResource } from "@app/lib/resources/base_resource";
import { defineCachedResourceList } from "@app/lib/resources/cached_resource_store";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { isWhitelistableFeature } from "@app/types/shared/feature_flags";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import { RequestCachedQuery } from "@app/types/shared/utils/request_context";
import type { LightWorkspaceType, WorkspaceType } from "@app/types/user";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

// Feature flags are a stable snapshot for the request. Mutations become
// visible on the next request.
const listForWorkspaceQuery = new RequestCachedQuery<
  ModelId,
  FeatureFlagResource[]
>();

const FEATURE_FLAG_CACHE_VERSION = 2;

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

  // Deletes every row for one flag name, whatever the workspace, and invalidates the affected
  // per-workspace caches. The name is a plain string so leftover rows for a flag that is no
  // longer declared in WHITELISTABLE_FEATURES_CONFIG can be removed too.
  private static async destroyForAllWorkspacesByName(
    name: string
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

    await FeatureFlagResource.listForWorkspaceCache.invalidateMany(
      workspaceModelIds
    );

    return deleted;
  }

  static async disableForAllWorkspaces(
    name: WhitelistableFeature
  ): Promise<number> {
    return FeatureFlagResource.destroyForAllWorkspacesByName(name);
  }

  static async countForAllWorkspaces(
    name: WhitelistableFeature
  ): Promise<number> {
    return FeatureFlagResource.countForAllWorkspacesByName(name);
  }

  // Counts the rows of one flag name across every workspace. The name is a plain string so that
  // leftover rows for a flag no longer declared in WHITELISTABLE_FEATURES_CONFIG can be counted.
  static async countForAllWorkspacesByName(name: string): Promise<number> {
    // `count` does not go through the workspace-isolation find hook, so no bypass is needed.
    return FeatureFlagModel.count({ where: { name } });
  }

  // One entry per distinct flag name present in the database, with the number of workspaces the
  // flag is enabled on. Names no longer declared in WHITELISTABLE_FEATURES_CONFIG are included.
  static async countByFlagNameForAllWorkspaces(): Promise<Map<string, number>> {
    // `count` does not go through the workspace-isolation find hook, so no bypass is needed.
    const rows = await FeatureFlagModel.count({ group: ["name"] });

    const countByName = new Map<string, number>();
    for (const row of rows) {
      const { name } = row;
      if (isString(name)) {
        countByName.set(name, row.count);
      }
    }

    return countByName;
  }

  // Lists the rows of one flag name across every workspace, most recently created first. Names no
  // longer declared in WHITELISTABLE_FEATURES_CONFIG are returned too, so leftover rows stay
  // visible to the maintenance tooling.
  static async dangerouslyListForAllWorkspacesByName(
    name: string,
    { limit }: { limit: number }
  ): Promise<FeatureFlagResource[]> {
    const flags = await FeatureFlagModel.findAll({
      where: { name },
      order: [["createdAt", "DESC"]],
      limit,
      // WORKSPACE_ISOLATION_BYPASS: this maintenance query intentionally lists one flag across all workspaces.
      // @ts-expect-error -- Cross-workspace query by design.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    return flags.map(
      (flag) => new FeatureFlagResource(FeatureFlagModel, flag.get())
    );
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
    return FeatureFlagResource.countForAllWorkspacesByName(name);
  }

  static async deleteLegacyByName(name: string): Promise<number> {
    return FeatureFlagResource.destroyForAllWorkspacesByName(name);
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
