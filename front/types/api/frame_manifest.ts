import {
  DEFAULT_SANDBOX_FUNCTION_EXECUTION_MODE,
  DEFAULT_SANDBOX_FUNCTION_STAKE,
  SANDBOX_DATABASE_NAME_REGEX,
  SANDBOX_FUNCTION_EXECUTION_MODES,
  SANDBOX_FUNCTION_SLUG_REGEX,
  SANDBOX_FUNCTION_STAKES,
} from "@app/types/api/sandbox_functions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export const FRAME_MANIFEST_FILE = "manifest.json";
export const FRAME_MANIFEST_VERSION = 1;
export const FRAME_DEFAULT_UI_ENTRY_POINT = "index.tsx";
/** Upper bound on a Frame's name, which is the basename of its source folder. */
export const MAX_FRAME_NAME_LENGTH = 128;
export const MAX_FRAME_FUNCTION_NAME_LENGTH = 128;
export const MAX_FRAME_FUNCTION_DESCRIPTION_LENGTH = 255;
// Each schema reconcile can take 60 seconds and runs under the 10-minute publication lease.
export const MAX_FRAME_DATABASE_COUNT = 4;
export const FRAME_DATABASE_NAME_REGEX = SANDBOX_DATABASE_NAME_REGEX;

/**
 * @cc [owner:davidebbo,label:product;backend] frame-name-is-the-source-folder
 * A Frames v2 package is named by the folder holding its `manifest.json`, and by nothing else.
 * The name MUST be derived from the Frame's current path wherever it is displayed, never stored
 * alongside it: a stored copy drifts from the folder the file explorer shows the moment the Frame
 * moves, which is the divergence this derivation exists to make impossible.
 *
 * Returns null when the path is not a manifest, or when the manifest has no folder of its own.
 */
export function getFrameV2NameFromManifestPath(
  manifestPath: string
): string | null {
  const segments = manifestPath.split("/");
  if (segments.pop() !== FRAME_MANIFEST_FILE) {
    return null;
  }

  return segments.pop() || null;
}

/**
 * @cc [owner:davidebbo,label:product;backend] frame-name-is-one-path-segment
 * A Frame name MUST be a single non-empty path segment of at most `MAX_FRAME_NAME_LENGTH`
 * characters, and MUST NOT be `.` or `..`. Renaming a Frame moves its source folder, so a name
 * carrying a separator or a relative segment would escape the Frame's parent directory.
 */
export function validateFrameV2Name(name: string): Result<string, string> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return new Err("Frame name cannot be empty.");
  }
  if (trimmed.length > MAX_FRAME_NAME_LENGTH) {
    return new Err(
      `Frame name cannot exceed ${MAX_FRAME_NAME_LENGTH} characters.`
    );
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    return new Err("Frame name cannot contain path separators.");
  }
  if (trimmed === "." || trimmed === "..") {
    return new Err("Frame name cannot be '.' or '..'.");
  }

  return new Ok(trimmed);
}

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

export const FrameFunctionManifestSchema = z.object({
  name: z
    .string()
    .max(MAX_FRAME_FUNCTION_NAME_LENGTH)
    .regex(SANDBOX_FUNCTION_SLUG_REGEX, {
      message:
        "Function name must be lowercase alphanumeric with single hyphen separators.",
    }),
  description: z.string().max(MAX_FRAME_FUNCTION_DESCRIPTION_LENGTH),
  entryPoint: FrameRelativePathSchema,
  executionMode: z
    .enum(SANDBOX_FUNCTION_EXECUTION_MODES)
    .default(DEFAULT_SANDBOX_FUNCTION_EXECUTION_MODE),
  defaultStake: z
    .enum(SANDBOX_FUNCTION_STAKES)
    .default(DEFAULT_SANDBOX_FUNCTION_STAKE),
});

export const FrameDatabaseManifestSchema = z.object({
  name: z.string().regex(FRAME_DATABASE_NAME_REGEX, {
    message:
      "Database name must start with a lowercase letter and contain only lowercase letters, digits, and underscores.",
  }),
  schema: FrameRelativePathSchema,
});

export const FrameSourceManifestSchema = z
  .object({
    version: z.literal(FRAME_MANIFEST_VERSION),
    description: z.string(),
    uiEntryPoint: FrameRelativePathSchema.optional(),
    functions: z.array(FrameFunctionManifestSchema).default([]),
    databases: z
      .array(FrameDatabaseManifestSchema)
      .max(MAX_FRAME_DATABASE_COUNT)
      .default([]),
  })
  .superRefine((manifest, context) => {
    const functionNames = new Set<string>();

    manifest.functions.forEach((fn, index) => {
      if (functionNames.has(fn.name)) {
        context.addIssue({
          code: "custom",
          message: `Function name '${fn.name}' must be unique.`,
          path: ["functions", index, "name"],
        });
      }
      functionNames.add(fn.name);
    });

    const databaseNames = new Set<string>();
    manifest.databases.forEach((database, index) => {
      if (databaseNames.has(database.name)) {
        context.addIssue({
          code: "custom",
          message: `Database name '${database.name}' must be unique.`,
          path: ["databases", index, "name"],
        });
      }
      databaseNames.add(database.name);
    });
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
