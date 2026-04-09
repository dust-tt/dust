import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { makeScript } from "@app/scripts/helpers";
import { createSeedContext } from "@app/scripts/seed/factories";
import { seedReinforcement } from "@app/scripts/seed/reinforced-agents/seedReinforcedAgents";

makeScript({}, async ({ execute }, logger) => {
  const ctx = await createSeedContext({ execute, logger });

  // Enable the reinforced_agents feature flag
  logger.info("Enabling reinforced_agents feature flag...");
  if (execute) {
    await FeatureFlagResource.enableMany(ctx.workspace, ["reinforced_agents"]);
    logger.info("Feature flag enabled");
  }

  await seedReinforcement(ctx);

  logger.info("Reinforcement seed completed");
});
