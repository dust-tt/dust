import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import { createSeedContext } from "@app/scripts/seed/factories";
import { seedReinforcement } from "@app/scripts/seed/reinforcement/seedReinforcement";

makeScript({}, async ({ execute }, logger) => {
  const ctx = await createSeedContext({ execute, logger });

  // Self-improvement needs both prerequisites: the feature flag, and the
  // workspace opt-in the "Allow self-improving skills" toggle sets.
  logger.info("Enabling self-improvement for the workspace...");
  if (execute) {
    await FeatureFlagResource.enableMany(ctx.workspace, ["reinforced_agents"]);

    const workspace = await WorkspaceResource.fetchById(ctx.workspace.sId);
    if (!workspace) {
      throw new Error(`Workspace ${ctx.workspace.sId} not found`);
    }
    await workspace.updateWorkspaceSettings({
      metadata: { ...(workspace.metadata ?? {}), allowReinforcement: true },
    });

    logger.info("Feature flag and workspace setting enabled");
  }

  await seedReinforcement(ctx);

  logger.info("Reinforcement seed completed");
});
