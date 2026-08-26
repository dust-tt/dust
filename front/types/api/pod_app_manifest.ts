import {
  FRAME_DATABASE_SCHEMA_FILE_SUFFIX,
  FRAME_DEFAULT_UI_ENTRY_POINT,
  FRAME_MANIFEST_FILE,
  FRAME_MANIFEST_VERSION,
  FrameSourceManifestSchema,
  isSafeFrameRelativePath,
} from "@app/types/api/frame_manifest";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { z } from "zod";
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

export const POD_APP_MANIFEST_FILE = FRAME_MANIFEST_FILE;
export const POD_APP_MANIFEST_VERSION = FRAME_MANIFEST_VERSION;

/**
 * Default UI entry point when a manifest omits `uiEntryPoint`. Not baked into the zod schema as a
 * `.default(...)` because the missing-file semantics differ: an explicit entry point that doesn't
 * exist names the declared path in the error, while a defaulted one that doesn't exist gets a more
 * helpful "no entry point at all" message. Both are `invalid_manifest` — every app needs a frame.
 */
export const POD_APP_DEFAULT_UI_ENTRY_POINT = FRAME_DEFAULT_UI_ENTRY_POINT;

/**
 * Suffix a database schema file must keep wherever it lives. apps.ts's
 * POD_DATABASE_SCHEMA_FILE_SUFFIX aliases this constant rather than redeclaring it.
 */
export const POD_APP_MANIFEST_DB_FILE_SUFFIX =
  FRAME_DATABASE_SCHEMA_FILE_SUFFIX;

/**
 * A manifest path must stay inside the app folder: relative, forward slashes, and no `.`/`..`/empty
 * segments. Publish additionally checks the file actually exists in the folder.
 */
export function isSafePodAppRelativePath(path: string): boolean {
  return isSafeFrameRelativePath(path);
}

export const PodAppPublishManifestSchema = FrameSourceManifestSchema;

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
