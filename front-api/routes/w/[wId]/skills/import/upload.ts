import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importSkillsFromFiles } from "@app/lib/api/skills/detection/files/import_skills";
import { MAX_ZIP_SIZE_BYTES } from "@app/lib/api/skills/detection/zip/detect_skills";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { workspaceApp } from "@front-api/middleware/env";
import { apiError } from "@front-api/middleware/utils";
import type formidable from "formidable";

// Mounted at /api/w/:wId/skills/import/upload.
const app = workspaceApp();

app.post("/", async (ctx) => {
  const auth = ctx.get("auth");

  if (!auth.isBuilder()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: { type: "app_auth_error", message: "User is not a builder." },
    });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = await ctx.req.parseBody({ all: true });
  } catch (err) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `File upload failed: ${normalizeError(err).message}`,
      },
    });
  }

  // Extract names field — accepts repeated values.
  const rawNames = parsed.names;
  let fieldNames: string[] = [];
  if (Array.isArray(rawNames)) {
    fieldNames = rawNames.filter((n): n is string => typeof n === "string");
  } else if (typeof rawNames === "string") {
    fieldNames = [rawNames];
  }
  if (fieldNames.length === 0) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "names field is required.",
      },
    });
  }

  const rawFiles = parsed.files;
  const blobs: File[] = [];
  if (Array.isArray(rawFiles)) {
    for (const v of rawFiles) {
      if (v instanceof File) {
        blobs.push(v);
      }
    }
  } else if (rawFiles instanceof File) {
    blobs.push(rawFiles);
  }

  if (blobs.length === 0) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "No files uploaded.",
      },
    });
  }

  for (const blob of blobs) {
    if (blob.size > MAX_ZIP_SIZE_BYTES) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `File upload failed: file exceeds the maximum size of ${MAX_ZIP_SIZE_BYTES} bytes.`,
        },
      });
    }
  }

  const tmpDir = await mkdtemp(join(tmpdir(), "skills-import-"));
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

  const result = await importSkillsFromFiles(auth, {
    uploadedFiles: formidableFiles,
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
