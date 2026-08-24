import { MAX_POD_APP_NAME_LENGTH } from "@app/types/api/pod_apps";
import {
  POD_DATABASE_NAME_REGEX,
  SANDBOX_FUNCTION_EXECUTION_MODES,
  SANDBOX_FUNCTION_SLUG_SEGMENT_REGEX,
  SANDBOX_FUNCTION_STAKES,
} from "@app/types/api/sandbox_functions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";
import { fromError } from "zod-validation-error";

/**
 * A Pod app's own manifest: `manifest.json` at the root of the app folder, declaring the app's
 * display name, description, and what publishing it means — its UI entry point, functions, and
 * databases, each pointing at a folder-relative source path.
 *
 * Distinct from the ARCHIVE manifest (`pod_app_archive.ts`), which packages files for the
 * experimental import/export zips: this one lives in the folder itself and needs no `files` array
 * because the folder is the source of truth. The two are deliberately not compatible.
 *
 * Because names are declared here rather than derived from filenames, source paths are free:
 * `functions/` and `databases/` remain the documented convention, but a manifest may point
 * anywhere inside the folder. The app's identity is untouched — the prefix still derives from the
 * FOLDER name, and this `name` is display-only.
 *
 * Every app has exactly one UI entry point, declared via `uiEntryPoint`. When omitted, it defaults
 * to `POD_APP_DEFAULT_UI_ENTRY_POINT` ("index.tsx"). Either way the file must exist in the folder:
 * publishing an app whose entry point (explicit or defaulted) is missing is an `invalid_manifest`
 * error — there is no such thing as a UI-less app. A "functions-only" app still ships a minimal
 * frame at its entry point.
 */

export const POD_APP_MANIFEST_FILE = "manifest.json";
export const POD_APP_MANIFEST_VERSION = 1;

/**
 * Default UI entry point when a manifest omits `uiEntryPoint`. Not baked into the zod schema as a
 * `.default(...)` because the missing-file semantics differ: an explicit entry point that doesn't
 * exist names the declared path in the error, while a defaulted one that doesn't exist gets a more
 * helpful "no entry point at all" message. Both are `invalid_manifest` — every app needs a frame.
 */
export const POD_APP_DEFAULT_UI_ENTRY_POINT = "index.tsx";

/**
 * Suffix a database schema file must keep wherever it lives. apps.ts's
 * POD_DATABASE_SCHEMA_FILE_SUFFIX aliases this constant rather than redeclaring it.
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
    /** Folder-relative path to the app's UI entry point; defaults to `index.tsx` when omitted. */
    uiEntryPoint: RelativePathSchema.optional(),
    functions: z.array(PodAppManifestFunctionSchema).default([]),
    databases: z.array(PodAppManifestDatabaseSchema).default([]),
  })
  .superRefine((manifest, ctx) => {
    const dimensions = [
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

/**
 * Parse and validate a `manifest.json` buffer. Shared by `publishPodApp` and `listPodApps`'s
 * `readAppManifests`, whose only difference is how they map the returned `Err` string into their
 * own error shape.
 */
export function parsePodAppManifest(
  buffer: Buffer
): Result<PodAppPublishManifest, string> {
  let json: unknown;
  try {
    json = JSON.parse(buffer.toString("utf-8"));
  } catch (err) {
    return new Err(
      `manifest.json is not valid JSON: ${normalizeError(err).message}`
    );
  }

  const validation = PodAppPublishManifestSchema.safeParse(json);
  if (!validation.success) {
    return new Err(fromError(validation.error).toString());
  }

  return new Ok(validation.data);
}

/** What a manifest publish did, as the business layer reports it and the tool returns it. */
export type PodAppPublishSummary = {
  prefix: string;
  /** The folder name, i.e. the app's identity. */
  name: string;
  /** The manifest's display name. */
  displayName: string;
  reconciledDatabaseNames: string[];
  publishedFunctionSlugs: string[];
  /**
   * Folder-relative path of the frame published. Every app has one to publish; this is `null`
   * only when publishing it failed and the failure was recorded as a warning instead.
   */
  publishedFrameName: string | null;
  /** Functions carrying this app's prefix that the manifest no longer declares. */
  unpublishedFunctionSlugs: string[];
  /** Steps that were attempted and failed non-fatally, plus orphan-database notices. */
  warnings: string[];
};
