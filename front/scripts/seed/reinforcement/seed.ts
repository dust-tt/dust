import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { makeScript } from "@app/scripts/helpers";
import { createSeedContext } from "@app/scripts/seed/factories";
import { seedReinforcement } from "@app/scripts/seed/reinforcement/seedReinforcement";

makeScript({}, async ({ execute }, logger) => {
  const ctx = await createSeedContext({ execute, logger });

  // Enable the self-improvement feature flag
  logger.info("Enabling self-improvement feature flag...");
  if (execute) {
    await FeatureFlagResource.enableMany(ctx.workspace, ["reinforced_agents"]);
    logger.info("Feature flag enabled");
  }

  await seedReinforcement(ctx);

  logger.info("Reinforcement seed completed");
});
