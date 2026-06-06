import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import type { PokeGetPluginAsyncArgsResponseBody } from "@app/lib/api/poke/plugins/async_args";
import { fetchPluginResource } from "@app/lib/api/poke/utils";
import { Authenticator } from "@app/lib/auth";
import { supportedResourceTypes } from "@app/types/poke/plugins";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const AsyncArgsQuerySchema = z.object({
  resourceType: z.enum(supportedResourceTypes),
  resourceId: z.string().optional(),
  workspaceId: z.string().optional(),
});

const ParamsSchema = z.object({
  pluginId: z.string(),
});

// Mounted at /api/poke/plugins/:pluginId/async-args.
const app = pokeApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", AsyncArgsQuerySchema),
  async (ctx): HandlerResult<PokeGetPluginAsyncArgsResponseBody> => {
    const { pluginId } = ctx.req.valid("param");

    const { resourceType, resourceId, workspaceId } = ctx.req.valid("query");

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

    const hasAsyncFields = Object.values(plugin.manifest.args).some(
      (arg) => arg.async === true
    );
    if (!hasAsyncFields) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Plugin does not have any async fields defined.",
        },
      });
    }

    if (!plugin.populateAsyncArgs) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message:
            "Plugin has async fields but missing populateAsyncArgs implementation. This should not happen with proper TypeScript validation.",
        },
      });
    }

    let auth = ctx.get("auth");
    if (workspaceId) {
      const session = ctx.get("session");
      auth = await Authenticator.fromSuperUserSession(session, workspaceId);
    }

    let resource = null;
    if (resourceId) {
      resource = await fetchPluginResource(auth, resourceType, resourceId);
      if (!resource) {
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: "Could not find the resource.",
          },
        });
      }
    }

    const asyncArgsResult = await plugin.populateAsyncArgs(auth, resource);
    if (asyncArgsResult.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to populate async args: ${asyncArgsResult.error.message}`,
        },
      });
    }

    return ctx.json({ asyncArgs: asyncArgsResult.value });
  }
);

export default app;
