import { detectSkillsFromUploadedFiles } from "@app/lib/api/skills/detection/files/detect_skills";
import { MAX_ZIP_SIZE_BYTES } from "@app/lib/api/skills/detection/zip/detect_skills";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { DetectedSkillSummary } from "@app/lib/skill_detection";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { createHono } from "@front-api/lib/hono";
import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";
import { ensureIsBuilder } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import type { HttpBindings } from "@hono/node-server";
import formidable from "formidable";

// Mounted at /api/w/:wId/skills/detect/upload.
//
// We extend the workspace context with `HttpBindings` so we can hand the
// underlying Node `IncomingMessage` (exposed by `@hono/node-server` on
// `ctx.env.incoming`) to `formidable.parse(...)` — matching the Next handler.
const app = createHono<WorkspaceAwareCtx & { Bindings: HttpBindings }>();

/** @ignoreswagger */
app.post("/", ensureIsBuilder(), async (ctx) => {
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

  const form = formidable({
    multiples: true,
    maxFileSize: MAX_ZIP_SIZE_BYTES,
  });

  let files: formidable.Files;
  try {
    [, files] = await form.parse(incoming);
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

  const result = await detectSkillsFromUploadedFiles(uploadedFiles);
  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: result.error.message,
      },
    });
  }

  const detectedSkills = result.value;

  if (detectedSkills.length === 0) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "No skills found. Skills must contain a SKILL.md file with valid YAML frontmatter (see https://agentskills.io/specification).",
      },
    });
  }

  const existingSkills = await SkillResource.fetchByNames(
    auth,
    detectedSkills.map((s) => s.name)
  );

  const existingSkillsMap = new Map(existingSkills.map((s) => [s.name, s]));

  const skillSummaries: DetectedSkillSummary[] = detectedSkills.map((skill) => {
    const existing = existingSkillsMap.get(skill.name);

    if (!existing) {
      return {
        name: skill.name,
        status: "ready",
        existingSkillId: null,
      };
    }

    if (existing.source === "local_file") {
      return {
        name: skill.name,
        status: "skill_already_exists",
        existingSkillId: existing.sId,
      };
    }

    return {
      name: skill.name,
      status: "name_conflict",
      existingSkillId: existing.sId,
    };
  });

  return ctx.json({ skills: skillSummaries });
});

export default app;
