import {
  listMetronomePackages,
  type MetronomePackageSummary,
} from "@app/lib/metronome/client";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type GetPokeMetronomePackagesResponseBody = {
  packages: MetronomePackageSummary[];
};

// Mounted at /api/poke/metronome/packages. pokeAuth is applied by the parent
// poke sub-app.
const app = new Hono();

app.get(
  "/",
  async (ctx): HandlerResult<GetPokeMetronomePackagesResponseBody> => {
    const result = await listMetronomePackages();
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 502,
        api_error: {
          type: "internal_server_error",
          message: `Failed to list Metronome packages: ${result.error.message}`,
        },
      });
    }

    return ctx.json({ packages: result.value });
  }
);

export default app;
