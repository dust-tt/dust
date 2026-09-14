import type { GetPokeFeatureFlagWorkspacesResponseBody } from "@app/lib/api/poke/feature_flags";
import { listWorkspacesForFeatureFlag } from "@app/lib/api/poke/feature_flags";
import { isWhitelistableFeature } from "@app/types/shared/feature_flags";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  flagName: z.string(),
});

// Mounted at /api/poke/feature-flags/:flagName. pokeAuth is applied by the
// parent poke sub-app.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetPokeFeatureFlagWorkspacesResponseBody> => {
    const { flagName } = ctx.req.valid("param");

    const result = await listWorkspacesForFeatureFlag(flagName);

    // A name that is neither configured nor present in the database is a bad URL, not a flag
    // that happens to be enabled nowhere.
    if (!isWhitelistableFeature(flagName) && result.workspaces.length === 0) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "feature_flag_not_found",
          message: `Unknown feature flag: ${flagName}.`,
        },
      });
    }

    return ctx.json(result);
  }
);

export default app;
