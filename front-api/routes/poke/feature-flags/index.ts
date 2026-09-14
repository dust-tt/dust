import type { GetPokeFeatureFlagsResponseBody } from "@app/lib/api/poke/feature_flags";
import { listFeatureFlagUsage } from "@app/lib/api/poke/feature_flags";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import flagName from "./[flagName]";

// Mounted at /api/poke/feature-flags. pokeAuth is applied by the parent poke
// sub-app.
const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetPokeFeatureFlagsResponseBody> => {
  const featureFlags = await listFeatureFlagUsage();

  return ctx.json({ featureFlags });
});

app.route("/:flagName", flagName);

export default app;
