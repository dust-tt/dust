import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import type { PokeGetPluginDetailsResponseBody } from "@app/types/api/poke/plugins/manifest";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  pluginId: z.string(),
});

// Mounted at /api/poke/plugins/:pluginId/manifest.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeGetPluginDetailsResponseBody> => {
    const { pluginId } = ctx.req.valid("param");

    const plugin = pluginManager.getPluginById(pluginId);
    if (!plugin) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "plugin_not_found",
          message: "Could not find the plugin.",
        },
      });
    }

    return ctx.json({ manifest: plugin.manifest });
  }
);

export default app;
