import { apiError } from "@front-api/middleware/utils";
import type formidable from "formidable";
import { Hono } from "hono";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { detectSkillsFromUploadedFiles } from "@app/lib/api/skills/detection/files/detect_skills";
import { MAX_ZIP_SIZE_BYTES } from "@app/lib/api/skills/detection/zip/detect_skills";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { DetectedSkillSummary } from "@app/lib/skill_detection";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// Mounted at /api/w/:wId/skills/detect/upload.
const app = new Hono();

app.post("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.isBuilder()) {
    return apiError(c, {
      status_code: 403,
      api_error: { type: "app_auth_error", message: "User is not a builder." },
    });
  }

  // Parse the multipart body. `all: true` ensures multiple files under the
  // same field name are returned as an array.
  let parsed: Record<string, unknown>;
  try {
    parsed = await c.req.parseBody({ all: true });
  } catch (err) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `File upload failed: ${normalizeError(err).message}`,
      },
    });
  }

  const rawFiles = parsed.files;
  const blobs: File[] = [];
  if (Array.isArray(rawFiles)) {
    for (const v of rawFiles) {
      if (v instanceof File) blobs.push(v);
    }
  } else if (rawFiles instanceof File) {
    blobs.push(rawFiles);
  }

  if (blobs.length === 0) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "No files uploaded.",
      },
    });
  }

  // Enforce the max size per file.
  for (const blob of blobs) {
    if (blob.size > MAX_ZIP_SIZE_BYTES) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `File upload failed: file exceeds the maximum size of ${MAX_ZIP_SIZE_BYTES} bytes.`,
        },
      });
    }
  }

  // Persist the blobs to a tmp dir so the existing lib code (which reads from
  // formidable.File.filepath) can keep working unchanged.
  const tmpDir = await mkdtemp(join(tmpdir(), "skills-detect-"));
  const formidableFiles: formidable.File[] = [];
  for (let i = 0; i < blobs.length; i++) {
    const blob = blobs[i];
    const filepath = join(tmpDir, `upload-${i}`);
    const buffer = Buffer.from(await blob.arrayBuffer());
    await writeFile(filepath, buffer);
    formidableFiles.push({
      filepath,
      originalFilename: blob.name ?? null,
      size: blob.size,
      newFilename: `upload-${i}`,
      mimetype: blob.type || null,
      hash: null,
      hashAlgorithm: false,
      mtime: null,
      toJSON: () => ({}) as never,
      toString: () => filepath,
    } as unknown as formidable.File);
  }

  const result = await detectSkillsFromUploadedFiles(formidableFiles);
  if (result.isErr()) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: result.error.message,
      },
    });
  }

  const detectedSkills = result.value;

  if (detectedSkills.length === 0) {
    return apiError(c, {
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

  return c.json({ skills: skillSummaries });
});

export default app;
