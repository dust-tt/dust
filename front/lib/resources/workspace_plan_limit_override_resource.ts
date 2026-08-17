import type { PlanLimitOverride } from "@app/lib/plans/plan_limit_overrides";
import {
  hasAnyPlanLimitOverride,
  OVERRIDABLE_PLAN_LIMITS,
} from "@app/lib/plans/plan_limit_overrides";
import { WorkspacePlanLimitOverrideModel } from "@app/lib/resources/storage/models/workspace_plan_limit_override";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import type { Transaction } from "sequelize";

function toPlanLimitOverride(
  row: WorkspacePlanLimitOverrideModel
): PlanLimitOverride {
  return {
    maxUsersInWorkspace: row.maxUsersInWorkspace,
    maxFreeUsersInWorkspace: row.maxFreeUsersInWorkspace,
    maxLifetimeFreeUsersInWorkspace: row.maxLifetimeFreeUsersInWorkspace,
    maxVaultsInWorkspace: row.maxVaultsInWorkspace,
    maxDataSourcesCount: row.maxDataSourcesCount,
    maxConnectionsCount: row.maxConnectionsCount,
  };
}

// A limit is `null` (not overridden), `-1` (unlimited) or a non-negative count,
// matching the plan convention.
function validatePlanLimitOverride(
  override: PlanLimitOverride
): Result<undefined, Error> {
  for (const key of OVERRIDABLE_PLAN_LIMITS) {
    const value = override[key];
    if (value !== null && (!Number.isInteger(value) || value < -1)) {
      return new Err(
        new Error(
          `${key} must be -1 (unlimited) or a non-negative integer, got ${value}.`
        )
      );
    }
  }

  return new Ok(undefined);
}

/**
 * A workspace has at most one override row, and callers only ever need its
 * values — never a row identity — so this resource exposes statics returning
 * plain {@link PlanLimitOverride} objects and never instantiates itself.
 */
export class WorkspacePlanLimitOverrideResource {
  static model: ModelStaticWorkspaceAware<WorkspacePlanLimitOverrideModel> =
    WorkspacePlanLimitOverrideModel;

  /**
   * Returns the plan-limit overrides for a workspace, or `null` when the
   * workspace has none. Used by `SubscriptionResource` when resolving the plan.
   */
  static async fetchByWorkspace({
    workspace,
    transaction,
  }: {
    workspace: LightWorkspaceType;
    transaction?: Transaction;
  }): Promise<PlanLimitOverride | null> {
    const row = await this.model.findOne({
      where: { workspaceId: workspace.id },
      transaction,
    });

    return row ? toPlanLimitOverride(row) : null;
  }

  /**
   * Batched variant of {@link fetchByWorkspace}: returns one entry per
   * workspace that has overrides (workspaces without any are simply absent).
   */
  static async fetchByWorkspaceModelIds(
    workspaceModelIds: ModelId[],
    transaction?: Transaction
  ): Promise<Map<ModelId, PlanLimitOverride>> {
    if (workspaceModelIds.length === 0) {
      return new Map();
    }

    const rows = await this.model.findAll({
      where: { workspaceId: workspaceModelIds },
      transaction,
      // WORKSPACE_ISOLATION_BYPASS: Plans are resolved for several workspaces at
      // once (`SubscriptionResource.fetchActiveByWorkspacesModelId`); the query
      // is scoped to exactly the requested workspaces.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    return new Map(
      rows.map((row) => [row.workspaceId, toPlanLimitOverride(row)])
    );
  }

  /**
   * Sets the overrides for a workspace. Fields set to `null` are cleared, so the
   * workspace falls back to its plan value. When no override remains, the row is
   * deleted rather than kept fully null. Rejects out-of-range limits.
   *
   * The caller is responsible for invalidating the subscription cache — see
   * `setWorkspacePlanLimitOverrides`, which is the entry point to use.
   */
  static async upsert({
    workspace,
    override,
  }: {
    workspace: LightWorkspaceType;
    override: PlanLimitOverride;
  }): Promise<Result<undefined, Error>> {
    const validation = validatePlanLimitOverride(override);
    if (validation.isErr()) {
      return validation;
    }

    if (!hasAnyPlanLimitOverride(override)) {
      await this.model.destroy({
        where: { workspaceId: workspace.id },
      });
      return new Ok(undefined);
    }

    const existing = await this.model.findOne({
      where: { workspaceId: workspace.id },
    });

    if (existing) {
      await existing.update(override);
    } else {
      await this.model.create({ ...override, workspaceId: workspace.id });
    }

    return new Ok(undefined);
  }

  static async deleteAllForWorkspace({
    workspace,
    transaction,
  }: {
    workspace: LightWorkspaceType;
    transaction?: Transaction;
  }): Promise<void> {
    await this.model.destroy({
      where: { workspaceId: workspace.id },
      transaction,
    });
  }
}
