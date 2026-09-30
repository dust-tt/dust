import { makeScript } from "@app/scripts/helpers";
import { seedConversationalBuilding } from "@app/scripts/seed/conversational_building/seedConversationalBuilding";
import { createSeedContext } from "@app/scripts/seed/factories";

makeScript({}, async ({ execute }, logger) => {
  const ctx = await createSeedContext({ execute, logger });

  await seedConversationalBuilding(ctx);

  logger.info("Conversational building seed completed");
});
