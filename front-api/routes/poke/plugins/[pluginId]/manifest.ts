import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import type {
  PluginArgs,
  PluginManifest,
  SupportedResourceType,
} from "@app/types/poke/plugins";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export interface PokeGetPluginDetailsResponseBody {
  manifest: PluginManifest<PluginArgs, SupportedResourceType>;
}

const ParamsSchema = z.object({
  pluginId: z.string(),
});

// Mounted at /api/poke/plugins/:pluginId/manifest.
const app = pokeApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeGetPluginDetailsResponseBody> => {
    const { pluginId } = ctx.req.valid("param");
    if (!pluginId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Missing `pluginId` in path.",
        },
      });
    }

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
