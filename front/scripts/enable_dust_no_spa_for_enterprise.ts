import { PlanModel, SubscriptionModel } from "@app/lib/models/plan";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { Op } from "sequelize";

const FEATURE_FLAG_NAME: WhitelistableFeature = "dust_no_spa";

makeScript({}, async ({ execute }, logger) => {
  // Find all enterprise plans (codes starting with "ENT_").
  const enterprisePlans = await PlanModel.findAll({
    attributes: ["id", "code"],
    where: {
      code: {
        [Op.like]: "ENT_%",
      },
    },
    raw: true,
  });

  if (enterprisePlans.length === 0) {
    logger.info("No enterprise plans found; nothing to do.");
    return;
  }

  const planIds = enterprisePlans.map((p) => p.id);

  logger.info(
    { planCodes: enterprisePlans.map((p) => p.code) },
    `Found ${enterprisePlans.length} enterprise plan(s).`
  );

  // Find all active subscriptions on enterprise plans.
  const activeSubscriptions = await SubscriptionModel.findAll({
    attributes: ["workspaceId"],
    where: {
      planId: { [Op.in]: planIds },
      status: "active",
    },
    raw: true,
  });

  const workspaceModelIds = [
    ...new Set(
      activeSubscriptions
        .map((s) => s.workspaceId)
        .filter((id): id is number => id !== null)
    ),
  ];

  if (workspaceModelIds.length === 0) {
    logger.info("No enterprise workspaces with active subscriptions found.");
    return;
  }

  logger.info(
    { count: workspaceModelIds.length },
    "Found enterprise workspaces with active subscriptions."
  );

  const workspaces = await WorkspaceResource.fetchByModelIds(workspaceModelIds);

  let enabledCount = 0;
  let skippedCount = 0;

  for (const workspace of workspaces) {
    const isEnabled = await FeatureFlagResource.isEnabledForWorkspace(
      workspace,
      FEATURE_FLAG_NAME
    );

    if (isEnabled) {
      logger.info(
        { workspaceSId: workspace.sId, workspaceName: workspace.name },
        "Feature flag already enabled; skipping."
      );
      skippedCount++;
      continue;
    }

    if (execute) {
      await FeatureFlagResource.enable(workspace, FEATURE_FLAG_NAME);
      logger.info(
        { workspaceSId: workspace.sId, workspaceName: workspace.name },
        "Enabled dust_no_spa feature flag."
      );
    } else {
      logger.info(
        { workspaceSId: workspace.sId, workspaceName: workspace.name },
        "Would enable dust_no_spa feature flag."
      );
    }
    enabledCount++;
  }

  logger.info(
    { enabledCount, skippedCount, execute },
    "Done processing enterprise workspaces."
  );
});
