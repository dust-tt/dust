import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export const FRAME_MANIFEST_FILE = "manifest.json";
export const FRAME_MANIFEST_VERSION = 1;
export const FRAME_DEFAULT_UI_ENTRY_POINT = "index.tsx";
export const MAX_FRAME_NAME_LENGTH = 128;

/** Manifest paths are always relative to the Frame source folder. */
export function isSafeFrameRelativePath(path: string): boolean {
  if (path.startsWith("/") || path.includes("\\")) {
    return false;
  }

  const segments = path.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== ".."
  );
}

const FrameRelativePathSchema = z
  .string()
  .min(1)
  .refine(isSafeFrameRelativePath, {
    message:
      "Path must be relative to the Frame folder, using forward slashes and no '.', '..' or empty segments.",
  });

export const FrameSourceManifestSchema = z.object({
  version: z.literal(FRAME_MANIFEST_VERSION),
  name: z.string().min(1).max(MAX_FRAME_NAME_LENGTH),
  description: z.string(),
  uiEntryPoint: FrameRelativePathSchema.optional(),
});

export const FrameManifestSchema = FrameSourceManifestSchema.transform(
  (manifest) => ({
    ...manifest,
    uiEntryPoint: manifest.uiEntryPoint ?? FRAME_DEFAULT_UI_ENTRY_POINT,
  })
);

export type FrameManifest = z.infer<typeof FrameManifestSchema>;

export function parseFrameManifest(
  buffer: Buffer
): Result<FrameManifest, string> {
  let json: unknown;
  try {
    json = JSON.parse(buffer.toString("utf-8"));
  } catch (err) {
    return new Err(
      `${FRAME_MANIFEST_FILE} is not valid JSON: ${normalizeError(err).message}`
    );
  }

  const validation = FrameManifestSchema.safeParse(json);
  if (!validation.success) {
    return new Err(fromError(validation.error).toString());
  }

  return new Ok(validation.data);
}
