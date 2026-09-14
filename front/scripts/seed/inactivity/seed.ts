import { makeScript } from "@app/scripts/helpers";
import { createSeedContext } from "@app/scripts/seed/factories";
import { seedInactivity } from "@app/scripts/seed/inactivity/seedInactivity";

makeScript({}, async ({ execute }, logger) => {
  const ctx = await createSeedContext({ execute, logger });

  await seedInactivity(ctx);
});
