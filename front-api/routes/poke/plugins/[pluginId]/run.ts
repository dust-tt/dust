import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import type { PluginResponse } from "@app/lib/api/poke/types";
import { fetchPluginResource } from "@app/lib/api/poke/utils";
import { Authenticator } from "@app/lib/auth";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { getClientIp } from "@app/lib/utils/request";
import {
  createZodSchemaFromArgs,
  supportedResourceTypes,
} from "@app/types/poke/plugins";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";
import { fromError } from "zod-validation-error";

// Subset of `formidable.File` that poke plugins consume from file args
// (the plugin Zod schema declares files as `z.any()`, so this is the
// runtime contract). Used to bridge Web `File` to formidable-style on the
// multipart path without an `as` cast.
interface BridgedFormidableFile {
  filepath: string;
  originalFilename: string | null;
  size: number;
  newFilename: string;
  mimetype: string | null;
  hash: null;
  hashAlgorithm: false;
  mtime: null;
  toJSON: () => Record<string, never>;
  toString: () => string;
}

const RunPluginQuerySchema = z.object({
  resourceType: z.enum(supportedResourceTypes),
  resourceId: z.string().optional(),
  workspaceId: z.string().optional(),
});

export interface PokeRunPluginResponseBody {
  result: PluginResponse;
}

// Mounted at /api/poke/plugins/:pluginId/run.
const app = new Hono();

app.post(
  "/",
  validate("query", RunPluginQuerySchema),
  async (ctx): HandlerResult<PokeRunPluginResponseBody> => {
    const pluginId = ctx.req.param("pluginId");
    if (!pluginId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Missing `pluginId` in path.",
        },
      });
    }

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
      let parsed: Record<string, string | File>;
      try {
        parsed = await ctx.req.parseBody();
      } catch (err) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Form parsing failed: ${normalizeError(err).message}`,
          },
        });
      }

      // Bridge Web `File` instances to a formidable.File-like shape so
      // existing plugins that read `file.filepath` keep working unchanged.
      const bridged: Record<string, BridgedFormidableFile | string> = {};
      let tmpDir: string | null = null;
      let fileIndex = 0;
      for (const [key, value] of Object.entries(parsed)) {
        if (value instanceof File) {
          if (!tmpDir) {
            tmpDir = await mkdtemp(join(tmpdir(), "poke-plugin-run-"));
          }
          const filename = `upload-${fileIndex++}`;
          const filepath = join(tmpDir, filename);
          await writeFile(filepath, Buffer.from(await value.arrayBuffer()));
          bridged[key] = {
            filepath,
            originalFilename: value.name || null,
            size: value.size,
            newFilename: filename,
            mimetype: value.type || null,
            hash: null,
            hashAlgorithm: false,
            mtime: null,
            toJSON: () => ({}),
            toString: () => filepath,
          };
        } else {
          bridged[key] = value;
        }
      }
      formData = bridged;
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
