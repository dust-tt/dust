import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { makeScript } from "@app/scripts/helpers";
import { seedConversationalBuilding } from "@app/scripts/seed/conversational_building/seedConversationalBuilding";
import { createSeedContext } from "@app/scripts/seed/factories";

makeScript({}, async ({ execute }, logger) => {
  const ctx = await createSeedContext({ execute, logger });

  logger.info("Enabling conversational_building feature flag...");
  if (execute) {
    await FeatureFlagResource.enableMany(ctx.workspace, [
      "conversational_building",
    ]);
    logger.info("Feature flag enabled");
  }

  await seedConversationalBuilding(ctx);

  logger.info("Conversational building seed completed");
});
