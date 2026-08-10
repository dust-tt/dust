import {
  importSkillsFromFiles,
  isImportConflictStrategy,
} from "@app/lib/api/skills/detection/files/import_skills";
import type { ImportSkillsResponseBody } from "@app/lib/api/skills/detection/github/import_skills";
import { MAX_ZIP_SIZE_BYTES } from "@app/lib/api/skills/detection/zip/detect_skills";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { createHono } from "@front-api/lib/hono";
import type { PublicApiCtx } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { HttpBindings } from "@hono/node-server";
import formidable from "formidable";
import { z } from "zod";

import skill from "./[skillId]";

export type GetPublicSkillsResponseBody = {
  skills: SkillType[];
};

const GetSkillsQuerySchema = z.object({
  status: z.enum(["active", "archived", "suggested"]).optional(),
});

const SkillAvailabilitiesSchema = z
  .array(z.enum(SKILL_AVAILABILITIES))
  .optional();
const SkillAvailabilitySchema = z.enum(SKILL_AVAILABILITIES).optional();

// Mounted at /api/v1/w/:wId/skills.
//
// We extend the public API context with `HttpBindings` so we can reach the
// underlying Node `IncomingMessage` via `ctx.env.incoming` and hand it to
// `formidable.parse(...)` for multipart parsing in the POST handler.
const app = createHono<PublicApiCtx & { Bindings: HttpBindings }>();

app.route("/:skillId", skill);

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
 *       - in: query
 *         name: availability
 *         required: false
 *         description: Filter skills by availability. Repeatable to match several values. Unpublished (editors) skills are only returned when bypassEditorVisibility is set.
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *             enum: [editors, workspace_users, users_and_agents]
 *         style: form
 *         explode: true
 *       - in: query
 *         name: bypassEditorVisibility
 *         required: false
 *         description: When true, also return unpublished (editors) skills. Requires an admin API key.
 *         schema:
 *           type: boolean
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
 *               editors:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: email
 *                 description: Optional editor email addresses to add to imported or updated skills. Editors must be active workspace builders. Existing skills keep their current editors.
 *               availability:
 *                 type: string
 *                 enum: [editors, workspace_users, users_and_agents]
 *                 description: Optional availability to apply to imported or updated skills. editors is unpublished, workspace_users is published, and users_and_agents is discoverable. New skills default to editors and existing skills keep their current availability when omitted.
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
 */
app.get(
  "/",
  validate("query", GetSkillsQuerySchema),
  async (ctx): HandlerResult<GetPublicSkillsResponseBody> => {
    const auth = ctx.get("auth");
    const { status } = ctx.req.valid("query");

    // Repeatable: ?availability=workspace_users&availability=users_and_agents.
    const availabilityValidation = SkillAvailabilitiesSchema.safeParse(
      ctx.req.queries("availability")
    );
    if (!availabilityValidation.success) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            'Invalid availability. Expected "editors", "workspace_users", or "users_and_agents".',
        },
      });
    }
    const availability =
      availabilityValidation.data && availabilityValidation.data.length > 0
        ? availabilityValidation.data
        : undefined;

    const bypassEditorVisibility =
      ctx.req.query("bypassEditorVisibility") === "true";

    // Only admin keys may bypass editor visibility to list unpublished skills (e.g. for
    // exporting all workspace skills).
    if (bypassEditorVisibility && !auth.isAdmin()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Only admins can bypass editor visibility.",
        },
      });
    }

    const allSkills = await SkillResource.listByWorkspace(auth, {
      status,
      onlyCustom: true,
      availability,
    });

    // API keys have no editor-group membership to scope them by, so they can't see
    // editor restricted skills unless editor visibility is explicitly bypassed.
    const skills = bypassEditorVisibility
      ? allSkills
      : allSkills.filter((skill) => skill.availability !== "editors");

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

  const { editors, names } = fields;

  const availabilityValidation = SkillAvailabilitySchema.safeParse(
    fields.availability?.[0]
  );
  if (!availabilityValidation.success) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          'Invalid availability. Expected "editors", "workspace_users", or "users_and_agents".',
      },
    });
  }

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
    availability: availabilityValidation.data,
    editors,
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
