import {
  importSkillsFromFiles,
  isImportConflictStrategy,
} from "@app/lib/api/skills/detection/files/import_skills";
import { MAX_ZIP_SIZE_BYTES } from "@app/lib/api/skills/detection/zip/detect_skills";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { PublicApiCtx } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { HttpBindings } from "@hono/node-server";
import formidable from "formidable";
import { Hono } from "hono";
import { z } from "zod";

export type GetPublicSkillsResponseBody = {
  skills: SkillType[];
};

export type ImportSkillsResponseBody = {
  imported: SkillType[];
  updated: SkillType[];
  skipped: { name: string; message: string }[];
};

const GetSkillsQuerySchema = z.object({
  status: z.enum(["active", "archived", "suggested"]).optional(),
});

// Mounted at /api/v1/w/:wId/skills.
//
// We extend the public API context with `HttpBindings` so we can reach the
// underlying Node `IncomingMessage` via `ctx.env.incoming` and hand it to
// `formidable.parse(...)` for multipart parsing in the POST handler.
const app = new Hono<PublicApiCtx & { Bindings: HttpBindings }>();

/**
 * @swagger
 * /api/v1/w/{wId}/skills:
 *   get:
 *     summary: List skills
 *     description: Retrieves the custom skills in the workspace. Active skills are returned by default.
 *     tags:
 *       - Skills
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         required: false
 *         description: Filter skills by status. Defaults to active.
 *         schema:
 *           type: string
 *           enum: [active, archived, suggested]
 *     responses:
 *       200:
 *         description: Skills available in the workspace.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 skills:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Skill'
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Workspace not found.
 *       405:
 *         description: Method not supported.
 *   post:
 *     summary: Import skills from uploaded files
 *     description: Imports skills from uploaded files or ZIP archives into the workspace.
 *     tags:
 *       - Skills
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - files
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Skill files or ZIP archives to import.
 *               names:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional skill names to import from the uploaded files.
 *               onConflict:
 *                 type: string
 *                 enum: [error, skip, override]
 *                 description: Conflict handling strategy. Defaults to error.
 *     responses:
 *       200:
 *         description: Skills import result.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 imported:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Skill'
 *                 updated:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Skill'
 *                 skipped:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       message:
 *                         type: string
 *       400:
 *         description: Bad Request. Missing or invalid uploaded files.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Workspace not found.
 *       405:
 *         description: Method not supported.
 */
app.get(
  "/",
  validate("query", GetSkillsQuerySchema),
  async (ctx): HandlerResult<GetPublicSkillsResponseBody> => {
    const auth = ctx.get("auth");
    const { status } = ctx.req.valid("query");

    const skills = await SkillResource.listByWorkspace(auth, {
      status,
      onlyCustom: true,
    });

    return ctx.json({
      skills: skills.map((skill) => skill.toJSON(auth)),
    });
  }
);

app.post("/", async (ctx): HandlerResult<ImportSkillsResponseBody> => {
  const auth = ctx.get("auth");

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
  if (!uploadedFiles || uploadedFiles.length === 0) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "No files uploaded.",
      },
    });
  }

  const { names } = fields;

  const onConflict = fields.onConflict?.[0] ?? "error";
  if (!isImportConflictStrategy(onConflict)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid onConflict value: "${onConflict}". Must be one of: error, skip, override.`,
      },
    });
  }

  const result = await importSkillsFromFiles(auth, {
    uploadedFiles,
    names,
    source: "api",
    onConflict,
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
