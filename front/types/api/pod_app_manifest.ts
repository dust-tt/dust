import { MAX_POD_APP_NAME_LENGTH } from "@app/types/api/pod_apps";
import {
  POD_DATABASE_NAME_REGEX,
  SANDBOX_FUNCTION_EXECUTION_MODES,
  SANDBOX_FUNCTION_SLUG_SEGMENT_REGEX,
  SANDBOX_FUNCTION_STAKES,
} from "@app/types/api/sandbox_functions";
import { z } from "zod";

/**
 * A Pod app's own manifest: `manifest.json` at the root of the app folder, declaring the app's
 * display name, description, and what publishing it means — its frames, functions, and databases,
 * each pointing at a folder-relative source path.
 *
 * Distinct from the ARCHIVE manifest (`pod_app_archive.ts`), which packages files for the
 * experimental import/export zips: this one lives in the folder itself and needs no `files` array
 * because the folder is the source of truth. The two are deliberately not compatible.
 *
 * Because names are declared here rather than derived from filenames, source paths are free:
 * `functions/` and `databases/` remain the documented convention, but a manifest may point
 * anywhere inside the folder. The app's identity is untouched — the prefix still derives from the
 * FOLDER name, and this `name` is display-only.
 */

export const POD_APP_MANIFEST_FILE = "manifest.json";
export const POD_APP_MANIFEST_VERSION = 1;

/**
 * Suffix a database schema file must keep wherever it lives. Same value as
 * POD_DATABASE_SCHEMA_FILE_SUFFIX in lib/api/projects/apps.ts, which cannot be imported from a
 * types module.
 */
export const POD_APP_MANIFEST_DB_FILE_SUFFIX = ".db.ts";

/**
 * A manifest path must stay inside the app folder: relative, forward slashes, and no `.`/`..`/empty
 * segments. Publish additionally checks the file actually exists in the folder.
 */
export function isSafePodAppRelativePath(path: string): boolean {
  if (path.startsWith("/") || path.includes("\\")) {
    return false;
  }
  const segments = path.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== ".."
  );
}

const RelativePathSchema = z.string().min(1).refine(isSafePodAppRelativePath, {
  message:
    "Path must be relative to the app folder, using forward slashes and no '.', '..' or empty segments.",
});

const PodAppManifestFrameSchema = z.object({
  /** Folder-relative path to the frame's source file. */
  path: RelativePathSchema,
});

const PodAppManifestFunctionSchema = z.object({
  /** Bare name; the published slug is `<appPrefix>__<name>`. */
  name: z.string().regex(SANDBOX_FUNCTION_SLUG_SEGMENT_REGEX),
  /** Folder-relative path to the function's TypeScript source. */
  path: RelativePathSchema,
  description: z.string().min(1),
  executionMode: z.enum(SANDBOX_FUNCTION_EXECUTION_MODES),
  /** Optional; publish applies its own default. */
  defaultStake: z.enum(SANDBOX_FUNCTION_STAKES).optional(),
});

const PodAppManifestDatabaseSchema = z.object({
  /** App-relative database name, what the schema file declares and `db()` opens. */
  name: z.string().regex(POD_DATABASE_NAME_REGEX),
  /** Folder-relative path to the drizzle schema file; must keep the `.db.ts` suffix. */
  path: RelativePathSchema.refine(
    (path) => path.endsWith(POD_APP_MANIFEST_DB_FILE_SUFFIX),
    {
      message: `Database schema paths must end in '${POD_APP_MANIFEST_DB_FILE_SUFFIX}'.`,
    }
  ),
});

export const PodAppPublishManifestSchema = z
  .object({
    version: z.literal(POD_APP_MANIFEST_VERSION),
    /** Human-facing display name; the folder name stays the app's identity. */
    name: z.string().min(1).max(MAX_POD_APP_NAME_LENGTH),
    description: z.string(),
    frames: z.array(PodAppManifestFrameSchema).default([]),
    functions: z.array(PodAppManifestFunctionSchema).default([]),
    databases: z.array(PodAppManifestDatabaseSchema).default([]),
  })
  .superRefine((manifest, ctx) => {
    const dimensions = [
      ["frame path", manifest.frames.map((frame) => frame.path)],
      ["function name", manifest.functions.map((fn) => fn.name)],
      ["database name", manifest.databases.map((db) => db.name)],
    ] as const;
    for (const [label, values] of dimensions) {
      const seen = new Set<string>();
      for (const value of values) {
        if (seen.has(value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate ${label} '${value}'.`,
          });
        }
        seen.add(value);
      }
    }
  });

export type PodAppPublishManifest = z.infer<typeof PodAppPublishManifestSchema>;

/** What a manifest publish did, as the business layer reports it and the tool returns it. */
export type PodAppPublishSummary = {
  prefix: string;
  /** The folder name, i.e. the app's identity. */
  name: string;
  /** The manifest's display name. */
  displayName: string;
  reconciledDatabaseNames: string[];
  publishedFunctionSlugs: string[];
  /** Folder-relative paths of the frames published. */
  publishedFrameNames: string[];
  /** Functions carrying this app's prefix that the manifest no longer declares. */
  unpublishedFunctionSlugs: string[];
  /** Steps that were attempted and failed non-fatally, plus orphan-database notices. */
  warnings: string[];
};
