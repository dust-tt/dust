import { FeatureFlagModel } from "@app/lib/models/feature_flag";
import { PlanModel, SubscriptionModel } from "@app/lib/models/plan";
import { isEnterprisePlanPrefix } from "@app/lib/plans/plan_codes";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { DISABLE_COMPUTER_FEATURE } from "@app/types/shared/feature_flags";

const SANDBOX_TOOLS_FEATURE =
  "sandbox_tools" as const satisfies WhitelistableFeature;

type EnterpriseWorkspace = {
  planCode: string;
  workspace: WorkspaceModel;
};

const FeatureFlagModelWithBypass: ModelStaticWorkspaceAware<FeatureFlagModel> =
  FeatureFlagModel;
const SubscriptionModelWithBypass: ModelStaticWorkspaceAware<SubscriptionModel> =
  SubscriptionModel;

async function listActiveEnterpriseWorkspaces(): Promise<
  EnterpriseWorkspace[]
> {
  const enterprisePlanModelIds = (
    await PlanModel.findAll({
      attributes: ["id", "code"],
    })
  )
    .filter((plan) => isEnterprisePlanPrefix(plan.code))
    .map((plan) => plan.id);

  if (enterprisePlanModelIds.length === 0) {
    return [];
  }

  const subscriptions = await SubscriptionModelWithBypass.findAll({
    attributes: ["id", "workspaceId", "planId"],
    where: {
      planId: enterprisePlanModelIds,
      status: "active",
    },
    include: [
      {
        model: PlanModel,
        as: "plan",
        required: true,
      },
      {
        model: WorkspaceModel,
        required: true,
      },
    ],
    // WORKSPACE_ISOLATION_BYPASS: this prodbox backfill intentionally scans active subscriptions across all workspaces.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  const byWorkspaceModelId = new Map<number, EnterpriseWorkspace>();

  for (const subscription of subscriptions) {
    if (!byWorkspaceModelId.has(subscription.workspace.id)) {
      byWorkspaceModelId.set(subscription.workspace.id, {
        planCode: subscription.plan.code,
        workspace: subscription.workspace,
      });
    }
  }

  return [...byWorkspaceModelId.values()];
}

async function listComputerFlagWorkspaceModelIds(
  workspaceModelIds: number[]
): Promise<{
  disabledWorkspaceModelIds: Set<number>;
  sandboxToolsWorkspaceModelIds: Set<number>;
}> {
  if (workspaceModelIds.length === 0) {
    return {
      disabledWorkspaceModelIds: new Set(),
      sandboxToolsWorkspaceModelIds: new Set(),
    };
  }

  const flags = await FeatureFlagModelWithBypass.findAll({
    attributes: ["workspaceId", "name"],
    where: {
      workspaceId: workspaceModelIds,
      name: [DISABLE_COMPUTER_FEATURE, SANDBOX_TOOLS_FEATURE],
    },
    // WORKSPACE_ISOLATION_BYPASS: this prodbox backfill needs one batched flag lookup across the enterprise workspaces found above.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  const disabledWorkspaceModelIds = new Set<number>();
  const sandboxToolsWorkspaceModelIds = new Set<number>();

  for (const flag of flags) {
    switch (flag.name) {
      case DISABLE_COMPUTER_FEATURE:
        disabledWorkspaceModelIds.add(flag.workspaceId);
        break;
      case SANDBOX_TOOLS_FEATURE:
        sandboxToolsWorkspaceModelIds.add(flag.workspaceId);
        break;
    }
  }

  return {
    disabledWorkspaceModelIds,
    sandboxToolsWorkspaceModelIds,
  };
}

makeScript({}, async ({ execute }, logger: Logger) => {
  const enterpriseWorkspaces = await listActiveEnterpriseWorkspaces();
  const { disabledWorkspaceModelIds, sandboxToolsWorkspaceModelIds } =
    await listComputerFlagWorkspaceModelIds(
      enterpriseWorkspaces.map(({ workspace }) => workspace.id)
    );

  const candidates = enterpriseWorkspaces.filter(
    ({ workspace }) => !sandboxToolsWorkspaceModelIds.has(workspace.id)
  );
  const workspacesToUpdate = candidates.filter(
    ({ workspace }) => !disabledWorkspaceModelIds.has(workspace.id)
  );

  logger.info(
    {
      activeEnterpriseWorkspaceCount: enterpriseWorkspaces.length,
      alreadyHasSandboxToolsCount: sandboxToolsWorkspaceModelIds.size,
      missingSandboxToolsCount: candidates.length,
      alreadyDisabledCount: candidates.length - workspacesToUpdate.length,
      toUpdateCount: workspacesToUpdate.length,
    },
    execute
      ? "Adding disable_computer_feature to enterprise workspaces without sandbox_tools"
      : "[DRYRUN] Would add disable_computer_feature to enterprise workspaces without sandbox_tools"
  );

  for (const { planCode, workspace } of workspacesToUpdate) {
    logger.info(
      {
        planCode,
        workspaceId: workspace.sId,
        workspaceModelId: workspace.id,
        workspaceName: workspace.name,
      },
      execute
        ? "Adding disable_computer_feature"
        : "[DRYRUN] Would add disable_computer_feature"
    );
  }

  if (execute && workspacesToUpdate.length > 0) {
    // Single batched write for a one-off prodbox script. The unique index on
    // (workspaceId, name) plus ignoreDuplicates keeps reruns idempotent.
    await FeatureFlagModel.bulkCreate(
      workspacesToUpdate.map(({ workspace }) => ({
        workspaceId: workspace.id,
        name: DISABLE_COMPUTER_FEATURE,
      })),
      {
        ignoreDuplicates: true,
      }
    );
  }
});
