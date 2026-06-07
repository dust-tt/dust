import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import type { PokeRunPluginResponseBody } from "@app/lib/api/poke/plugins/run";
import { fetchPluginResource } from "@app/lib/api/poke/utils";
import { Authenticator } from "@app/lib/auth";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { getClientIp } from "@app/lib/utils/request";
import {
  createZodSchemaFromArgs,
  supportedResourceTypes,
} from "@app/types/poke/plugins";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { createHono } from "@front-api/lib/hono";
import type { PokeCtx } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { HttpBindings } from "@hono/node-server";
import { IncomingForm } from "formidable";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const RunPluginQuerySchema = z.object({
  resourceType: z.enum(supportedResourceTypes),
  resourceId: z.string().optional(),
  workspaceId: z.string().optional(),
});

const ParamsSchema = z.object({
  pluginId: z.string(),
});

// Mounted at /api/poke/plugins/:pluginId/run.
//
// We extend the poke context with `HttpBindings` so we can hand the raw Node
// `IncomingMessage` (exposed by `@hono/node-server` on `ctx.env.incoming`) to
// `formidable.parse(...)` — matching the Next handler.
const app = createHono<PokeCtx & { Bindings: HttpBindings }>();

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("query", RunPluginQuerySchema),
  async (ctx): HandlerResult<PokeRunPluginResponseBody> => {
    const { pluginId } = ctx.req.valid("param");

    const { resourceType, resourceId, workspaceId } = ctx.req.valid("query");

    const headers: Record<string, string | string[] | undefined> = {};
    ctx.req.raw.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const ip = getClientIp({ headers });

    let auth = ctx.get("auth");
    if (ip !== "internal") {
      auth.setClientIp(ip);
    }
    if (workspaceId) {
      const session = ctx.get("session");
      auth = await Authenticator.fromSuperUserSession(session, workspaceId);
      if (ip !== "internal") {
        auth.setClientIp(ip);
      }
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

    const resource = resourceId
      ? await fetchPluginResource(auth, resourceType, resourceId)
      : null;

    const contentType = ctx.req.header("content-type") ?? "";
    // Typed as `unknown` because the real validation boundary is
    // `pluginSchema.safeParse` below — no point pretending the JSON body
    // is more structured than it is at this point.
    let formData: unknown;

    if (contentType.includes("application/json")) {
      try {
        formData = await ctx.req.json();
      } catch {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid JSON in request body",
          },
        });
      }
    } else if (
      contentType.includes("multipart/form-data") ||
      contentType.includes("application/x-www-form-urlencoded")
    ) {
      const incoming = ctx.env?.incoming;
      if (!incoming) {
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Multipart upload is not supported in this runtime.",
          },
        });
      }

      try {
        const form = new IncomingForm();
        const [fields, files] = await form.parse(incoming);

        // Flatten fields and files into a single object (formidable returns
        // every value as an array; collapse to the first entry to match the
        // Next handler).
        formData = Object.fromEntries([
          ...Object.entries(fields).map(([key, value]) => [key, value?.[0]]),
          ...Object.entries(files).map(([key, value]) => [key, value?.[0]]),
        ]);
      } catch (err) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Form parsing failed: ${normalizeError(err).message}`,
          },
        });
      }
    } else {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Unsupported content type. Expected application/json, application/x-www-form-urlencoded or multipart/form-data",
        },
      });
    }

    const pluginSchema = createZodSchemaFromArgs(plugin.manifest.args);
    const pluginArgsValidation = pluginSchema.safeParse(formData);
    if (!pluginArgsValidation.success) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `The request body is invalid: ${fromError(pluginArgsValidation.error).toString()}`,
        },
      });
    }

    const pluginRun = await PluginRunResource.makeNew(
      plugin,
      pluginArgsValidation.data,
      auth.getNonNullableUser(),
      workspaceId ? auth.getNonNullableWorkspace() : null,
      {
        resourceId: resourceId ?? undefined,
        resourceType,
      }
    );

    let runRes;
    try {
      runRes = await plugin.execute(auth, resource, pluginArgsValidation.data);
    } catch (error) {
      const errorMessage = normalizeError(error).message;
      await pluginRun.recordError(errorMessage);
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "plugin_execution_failed",
          message: errorMessage,
        },
      });
    }

    if (runRes.isErr()) {
      await pluginRun.recordError(runRes.error.message);
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "plugin_execution_failed",
          message: runRes.error.message,
        },
      });
    }

    await pluginRun.recordResult(runRes.value, plugin);

    return ctx.json({ result: runRes.value });
  }
);

export default app;
