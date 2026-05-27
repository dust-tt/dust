import { importSkillsFromFiles } from "@app/lib/api/skills/detection/files/import_skills";
import { MAX_ZIP_SIZE_BYTES } from "@app/lib/api/skills/detection/zip/detect_skills";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";
import { ensureIsBuilder } from "@front-api/middlewares/ensure_is_builder";
import { apiError } from "@front-api/middlewares/utils";
import type { HttpBindings } from "@hono/node-server";
import formidable from "formidable";
import { Hono } from "hono";

// Mounted at /api/w/:wId/skills/import/upload.
//
// We extend the workspace context with `HttpBindings` so we can hand the
// underlying Node `IncomingMessage` (exposed by `@hono/node-server` on
// `ctx.env.incoming`) to `formidable.parse(...)` — matching the Next handler.
const app = new Hono<WorkspaceAwareCtx & { Bindings: HttpBindings }>();

app.post("/", ensureIsBuilder(), async (ctx) => {
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

  let fields: formidable.Fields;
  let files: formidable.Files;
  try {
    const form = formidable({
      multiples: true,
      maxFileSize: MAX_ZIP_SIZE_BYTES,
    });
    [fields, files] = await form.parse(incoming);
  } catch (err) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `File upload failed: ${normalizeError(err).message}`,
      },
    });
  }

  const uploadedFiles = files.files;

  const fieldNames = fields.names;
  if (!fieldNames || fieldNames.length === 0) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "names field is required.",
      },
    });
  }

  if (!uploadedFiles || uploadedFiles.length === 0) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "No files uploaded.",
      },
    });
  }

  const result = await importSkillsFromFiles(auth, {
    uploadedFiles,
    names: fieldNames,
  });
  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: result.error.message,
      },
    });
  }

  return ctx.json({
    imported: result.value.imported.map((skill) => skill.toJSON(auth)),
    updated: result.value.updated.map((skill) => skill.toJSON(auth)),
    skipped: result.value.skipped,
  });
});

export default app;
