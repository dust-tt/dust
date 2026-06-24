import { FeatureFlagModel } from "@app/lib/models/feature_flag";
import { PlanModel, SubscriptionModel } from "@app/lib/models/plan";
import { isEnterprisePlanPrefix } from "@app/lib/plans/plan_codes";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { DISABLE_COMPUTER_FEATURE } from "@app/types/shared/feature_flags";

// Run with:
//   npx tsx scripts/disable_computer_for_enterprise_without_sandbox_tools.ts
//   npx tsx scripts/disable_computer_for_enterprise_without_sandbox_tools.ts --execute

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
  const subscriptions = await SubscriptionModelWithBypass.findAll({
    attributes: ["id", "workspaceId", "planId"],
    where: {
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

  const byWorkspaceId = new Map<number, EnterpriseWorkspace>();

  for (const subscription of subscriptions) {
    if (!isEnterprisePlanPrefix(subscription.plan.code)) {
      continue;
    }

    if (!byWorkspaceId.has(subscription.workspace.id)) {
      byWorkspaceId.set(subscription.workspace.id, {
        planCode: subscription.plan.code,
        workspace: subscription.workspace,
      });
    }
  }

  return [...byWorkspaceId.values()];
}

async function listComputerFlagWorkspaceIds(workspaceIds: number[]): Promise<{
  disabledWorkspaceIds: Set<number>;
  sandboxToolsWorkspaceIds: Set<number>;
}> {
  if (workspaceIds.length === 0) {
    return {
      disabledWorkspaceIds: new Set(),
      sandboxToolsWorkspaceIds: new Set(),
    };
  }

  const flags = await FeatureFlagModelWithBypass.findAll({
    attributes: ["workspaceId", "name"],
    where: {
      workspaceId: workspaceIds,
      name: [DISABLE_COMPUTER_FEATURE, SANDBOX_TOOLS_FEATURE],
    },
    // WORKSPACE_ISOLATION_BYPASS: this prodbox backfill needs one batched flag lookup across the enterprise workspaces found above.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  const disabledWorkspaceIds = new Set<number>();
  const sandboxToolsWorkspaceIds = new Set<number>();

  for (const flag of flags) {
    switch (flag.name) {
      case DISABLE_COMPUTER_FEATURE:
        disabledWorkspaceIds.add(flag.workspaceId);
        break;
      case SANDBOX_TOOLS_FEATURE:
        sandboxToolsWorkspaceIds.add(flag.workspaceId);
        break;
    }
  }

  return {
    disabledWorkspaceIds,
    sandboxToolsWorkspaceIds,
  };
}

makeScript({}, async ({ execute }, logger: Logger) => {
  const enterpriseWorkspaces = await listActiveEnterpriseWorkspaces();
  const { disabledWorkspaceIds, sandboxToolsWorkspaceIds } =
    await listComputerFlagWorkspaceIds(
      enterpriseWorkspaces.map(({ workspace }) => workspace.id)
    );

  const candidates = enterpriseWorkspaces.filter(
    ({ workspace }) => !sandboxToolsWorkspaceIds.has(workspace.id)
  );
  const workspacesToUpdate = candidates.filter(
    ({ workspace }) => !disabledWorkspaceIds.has(workspace.id)
  );

  logger.info(
    {
      activeEnterpriseWorkspaceCount: enterpriseWorkspaces.length,
      alreadyHasSandboxToolsCount: sandboxToolsWorkspaceIds.size,
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
