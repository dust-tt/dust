import { MAX_POD_APP_NAME_LENGTH } from "@app/types/api/pod_apps";
import {
  SANDBOX_FUNCTION_EXECUTION_MODES,
  SANDBOX_FUNCTION_STAKES,
} from "@app/types/api/sandbox_functions";
import type { InteractiveContentFileContentType } from "@app/types/files";
import { isInteractiveContentType } from "@app/types/files";
import { PodFrameTabSchema } from "@app/types/pod_frame_tab";
import { z } from "zod";

/**
 * A Pod app archive is a zip holding the app folder's files verbatim under `files/` plus a
 * `manifest.json` carrying what the files cannot: publish metadata and per-file content types.
 * Nothing in the archive encodes the source pod or workspace, so an archive imports identically
 * into any pod anywhere.
 */

export const POD_APP_ARCHIVE_FORMAT_VERSION = 1;
export const POD_APP_ARCHIVE_MANIFEST_FILE = "manifest.json";
export const POD_APP_ARCHIVE_FILES_PREFIX = "files/";

export const MAX_POD_APP_ARCHIVE_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_POD_APP_ARCHIVE_ENTRY_COUNT = 1000;
/** Zip-bomb guard: cap on the sum of declared uncompressed entry sizes. */
export const MAX_POD_APP_ARCHIVE_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

/** A non-Frame file in the archive. `path` is relative to the app folder, e.g. `functions/add.ts`. */
const PodAppManifestFileSchema = z.object({
  path: z.string().min(1),
  contentType: z.string().min(1),
});

const PodAppManifestFrameSchema = z.object({
  /** Frames only live at the top of the app folder, so the file name is the path. */
  fileName: z.string().min(1),
  contentType: z.custom<InteractiveContentFileContentType>(
    isInteractiveContentType,
    { message: "Not an interactive content type." }
  ),
  wasPublished: z.boolean(),
  /** The nav-tab metadata to re-pin with, when the Frame was pinned at export time. */
  pinnedTab: PodFrameTabSchema.omit({ path: true }).optional(),
});

const PodAppManifestFunctionSchema = z.object({
  /** Bare name (`list-tasks`); the slug is re-derived from the target folder name at publish. */
  name: z.string().min(1),
  description: z.string(),
  executionMode: z.enum(SANDBOX_FUNCTION_EXECUTION_MODES),
  /**
   * Optional so archives exported before stakes existed still import under the same format version;
   * publish then applies its own default.
   */
  defaultStake: z.enum(SANDBOX_FUNCTION_STAKES).optional(),
});

const PodAppManifestDatabaseSchema = z.object({
  /** App-relative name (`tasks`), declared by `databases/<name>.db.ts`. */
  name: z.string().min(1),
});

export const PodAppManifestSchema = z.object({
  formatVersion: z.literal(POD_APP_ARCHIVE_FORMAT_VERSION),
  name: z.string().min(1).max(MAX_POD_APP_NAME_LENGTH),
  exportedAt: z.string(),
  files: z.array(PodAppManifestFileSchema),
  frames: z.array(PodAppManifestFrameSchema),
  functions: z.array(PodAppManifestFunctionSchema),
  databases: z.array(PodAppManifestDatabaseSchema),
});

export type PodAppManifest = z.infer<typeof PodAppManifestSchema>;

/** What an import created, as the business layer reports it and the endpoint returns it. */
export type PodAppImportSummary = {
  prefix: string;
  name: string;
  importedFileCount: number;
  createdFrameNames: string[];
  publishedFunctionSlugs: string[];
  reconciledDatabaseNames: string[];
  publishedFrameNames: string[];
  pinnedTabPaths: string[];
  /** Steps that were attempted and failed non-fatally (e.g. a Frame that would not publish). */
  warnings: string[];
  /** Functions or databases the archive had no source for, so they were not recreated. */
  skipped: string[];
};

export type ImportPodAppResponseBody = {
  app: PodAppImportSummary;
};
