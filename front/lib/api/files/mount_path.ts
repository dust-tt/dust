// Pure path helpers for sandbox mount paths (gcsfuse mounting).
//
// Two scoped mounts are supported:
//   - "conversation": files scoped to a single conversation, mounted at /files/conversation
//   - "pod":          files scoped to a Pod (project space), mounted at /files/pod when the
//                     conversation belongs to a Pod. Persistent across conversations within
//                     the same Pod.

import type { FileResource } from "@app/lib/resources/file_resource";
import type { CanonicalScopedPathScope } from "@app/types/file_system";
import {
  LEGACY_PREFIX_CONVERSATION,
  LEGACY_PREFIX_PROJECT,
  parseCanonicalScopedPathScope,
  SCOPED_PREFIX_CONVERSATION,
  SCOPED_PREFIX_POD,
  TOOL_OUTPUTS_FOLDER_NAME,
} from "@app/types/file_system";
import type { AllSupportedFileContentType } from "@app/types/files";
import { extensionsForContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import path from "path";
import { z } from "zod";

export function getBaseMountPathForWorkspace({
  workspaceId,
}: {
  workspaceId: string;
}): string {
  return `w/${workspaceId}/`;
}

export function getConversationFilesBasePath({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string;
}): string {
  return `${getBaseMountPathForWorkspace({ workspaceId })}conversations/${conversationId}/files/`;
}

export {
  parseCanonicalScopedPath,
  TOOL_OUTPUTS_FOLDER_NAME,
} from "@app/types/file_system";

export function getConversationToolOutputsBasePath({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string;
}): string {
  return `${getConversationFilesBasePath({ workspaceId, conversationId })}${TOOL_OUTPUTS_FOLDER_NAME}/`;
}

export function getConversationFilePath({
  workspaceId,
  conversationId,
  fileName,
}: {
  workspaceId: string;
  conversationId: string;
  fileName: string;
}): string {
  return `${getConversationFilesBasePath({ workspaceId, conversationId })}${fileName}`;
}

export function getPodFilesBasePath({
  workspaceId,
  podId,
}: {
  workspaceId: string;
  podId: string;
}): string {
  return `${getBaseMountPathForWorkspace({ workspaceId })}pods/${podId}/files/`;
}

/**
 * Dedicated prefix for published sandbox function bundles, separate from the R/W pod files prefix.
 * `front` is the sole writer here, via the GCS API. The invocation path later mounts this prefix
 * read-only into sandboxes as DUST_FUNCTIONS_DIR, so a function can be executed but never
 * overwritten by a sandbox.
 */
export function getPodSandboxFunctionsBasePath({
  workspaceId,
  podId,
}: {
  workspaceId: string;
  podId: string;
}): string {
  return `${getBaseMountPathForWorkspace({ workspaceId })}pods/${podId}/sandbox-functions/`;
}

/**
 * Absolute in-sandbox path the pod's published bundles are mounted at. Pod-scoped like the
 * `/files/pod-<id>` files mount, so one sandbox could carry several pods' functions without
 * collision.
 */
export function getPodSandboxFunctionsMountPoint(podId: string): string {
  return `/sandbox-functions/pods/${podId}`;
}

/**
 * Absolute in-sandbox path of the pod's live SQLite databases (`{name}.db` files opened by
 * `@dust/pod`'s `db()`). Local disk, not a gcsfuse mount — Litestream replicates it to GCS.
 * Front is the only layer that hardcodes this location (the paths-env.v1 contract): it is
 * passed per exec to `dsbx function run` as `DUST_POD_DATABASES_DIR`, dsbx forwards it to
 * the bun child, and `@dust/pod` reads the env var — neither carries a fallback copy.
 *
 * TODO(pod-state): Track 1's parallel stack defines the same contract value as
 * `POD_STATE_DATABASES_DIR` in `front/lib/api/sandbox/db.ts` (litestream config /
 * restore side). Dedup into a single constant once both stacks are merged.
 */
export const POD_SANDBOX_DATABASES_DIR = "/pod-state/databases";

/**
 * Per-database size quota in bytes (1 GiB). The other half of the paths-env.v1 contract: like
 * the databases dir, front owns this value and passes it per exec as
 * `DUST_POD_DATABASE_MAX_SIZE_BYTES`; both `@dust/pod`'s `db()` and the `dsbx db query` runner
 * require it and carry no fallback (see `cli/dust-sandbox/pod/db.ts`). A single source here
 * keeps the quota the workload writes against identical to the one `db_query` enforces.
 */
const POD_SANDBOX_DATABASE_MAX_SIZE_BYTES = 1024 * 1024 * 1024;

/**
 * The env vars every pod-database exec (`dsbx function run` and every `dsbx db` subcommand)
 * must carry so the bun child resolves the databases dir and the size quota. Returned as a
 * fresh object so callers can spread it into their own env without sharing a reference.
 *
 * `databasePrefix` is the app prefix that namespaces the databases the exec resolves by their
 * app-relative name, i.e. `@dust/pod`'s `db("chat")` inside a published function (see
 * `podDatabasePrefixFromSlug`). Omit it for execs that address databases by their on-disk name —
 * every `dsbx db` subcommand does, since front resolves the name before running them.
 */
export function podDatabaseExecEnvVars({
  databasePrefix,
}: {
  databasePrefix?: string | null;
} = {}): {
  DUST_POD_DATABASES_DIR: string;
  DUST_POD_DATABASE_MAX_SIZE_BYTES: string;
  DUST_POD_DATABASE_PREFIX: string;
} {
  return {
    DUST_POD_DATABASES_DIR: POD_SANDBOX_DATABASES_DIR,
    DUST_POD_DATABASE_MAX_SIZE_BYTES: String(
      POD_SANDBOX_DATABASE_MAX_SIZE_BYTES
    ),
    // Empty means unprefixed, which is what the shim reads an absent value as.
    DUST_POD_DATABASE_PREFIX: databasePrefix ?? "",
  };
}

/**
 * Prefix for the pod's Litestream state replica (LTX chains for the pod's SQLite databases). The
 * sandbox's litestream daemon is the only writer, through the dust-state-only gcsfuse mount at
 * /pod-state/replica. Never mounted under /files, never a FileResource: cleanup is a wholesale
 * prefix delete at pod deletion (see deletePodStatePrefix).
 */
export function getPodStateBasePath({
  workspaceId,
  podId,
}: {
  workspaceId: string;
  podId: string;
}): string {
  return `${getBaseMountPathForWorkspace({ workspaceId })}pods/${podId}/state/`;
}

/**
 * Given a mount file path like "w/.../files/report.pdf",
 * returns "w/.../files/report.processed.pdf".
 * For files without extension: "w/.../files/Makefile" -> "w/.../files/Makefile.processed".
 *
 * When processedContentType is provided and differs from the original extension, the extension is
 * swapped to match the processed content type:
 *   "report.pdf" + "text/plain" -> "report.processed.txt"
 */
export function makeProcessedMountFileName({
  mountFilePath,
  processedContentType,
}: {
  mountFilePath: string;
  processedContentType?: AllSupportedFileContentType;
}): string {
  const lastSlash = mountFilePath.lastIndexOf("/");
  const dirPart = mountFilePath.substring(0, lastSlash + 1);
  const fileName = mountFilePath.substring(lastSlash + 1);

  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) {
    return `${dirPart}${fileName}.processed`;
  }

  const basename = fileName.substring(0, lastDot);
  const ext = processedContentType
    ? (extensionsForContentType(processedContentType)[0] ??
      fileName.substring(lastDot))
    : fileName.substring(lastDot);

  return `${dirPart}${basename}.processed${ext}`;
}

/**
 * Inverse of `makeProcessedMountFileName`: given a file name (no directory prefix), returns the
 * original source's base name when the input is a processed sibling, or `{ isProcessed: false }`
 * otherwise.
 *
 * Recognized shapes:
 *   "report.processed.txt"    -> { isProcessed: true, sourceBaseName: "report" }
 *   "photo.processed.jpg"     -> { isProcessed: true, sourceBaseName: "photo" }
 *   "Makefile.processed"      -> { isProcessed: true, sourceBaseName: "Makefile" }
 *
 * Anything else (including user-named files that merely contain ".processed." somewhere) returns
 * `{ isProcessed: false }`. The original extension is not recoverable from the processed name alone
 * (the processed content type may differ). Callers that need the full source path should match by
 * `sourceBaseName` against the listing.
 */
export function parseProcessedFilename(
  fileName: string
): { isProcessed: true; sourceBaseName: string } | { isProcessed: false } {
  const PROCESSED = ".processed";

  // Extension-less original: "<name>.processed".
  if (fileName.endsWith(PROCESSED)) {
    const sourceBaseName = fileName.slice(0, -PROCESSED.length);
    if (sourceBaseName.length === 0) {
      return { isProcessed: false };
    }

    return { isProcessed: true, sourceBaseName };
  }

  // Regular case: "<name>.processed.<ext>".
  const marker = `${PROCESSED}.`;
  const idx = fileName.lastIndexOf(marker);
  if (idx <= 0) {
    return { isProcessed: false };
  }

  const after = fileName.slice(idx + marker.length);
  // The processed extension is always a single segment (no nested dots).
  if (after.length === 0 || after.includes(".")) {
    return { isProcessed: false };
  }

  return { isProcessed: true, sourceBaseName: fileName.slice(0, idx) };
}

const scopedFilePathPrefixSchema = z.enum(["conversation", "pod"]);
type ScopedFilePathPrefix = z.infer<typeof scopedFilePathPrefixSchema>;

type ScopedFilePath = {
  prefix: ScopedFilePathPrefix;
  rel: string;
};

/**
 * Typed parse result for the first URL segment of a viz scoped path.
 *
 * - "canonical-conversation" / "canonical-pod": ID is embedded in the prefix
 *   (e.g. "conversation-abc123" or "pod-xyz456"). The id field is guaranteed non-empty.
 * - "legacy": bare keyword ("conversation" or "pod"); the resource ID must be
 *   resolved from the frame's metadata (useCaseMetadata).
 */
type ParsedVizScope =
  | CanonicalScopedPathScope
  | { kind: "legacy"; prefix: ScopedFilePathPrefix };

/**
 * Parse the first URL segment of a viz scoped path into a typed result.
 * Returns null for unrecognised prefixes (caller should return a 400).
 */
export function parseRawVizScope(rawScope: string): ParsedVizScope | null {
  const canonicalScope = parseCanonicalScopedPathScope(rawScope);
  if (canonicalScope) {
    return canonicalScope;
  }

  const r = scopedFilePathPrefixSchema.safeParse(rawScope);
  return r.success ? { kind: "legacy", prefix: r.data } : null;
}

/**
 * Parse a scoped file path like "conversation/chart.png" or "pod/report.pdf".
 * Returns null if the path is missing a valid scope prefix.
 */
export function parseScopedFilePath(filePath: string): ScopedFilePath | null {
  const slashIdx = filePath.indexOf("/");
  if (slashIdx <= 0) {
    return null;
  }
  const prefixResult = scopedFilePathPrefixSchema.safeParse(
    filePath.slice(0, slashIdx)
  );
  if (!prefixResult.success) {
    return null;
  }
  return { prefix: prefixResult.data, rel: filePath.slice(slashIdx + 1) };
}

/** Conversation/pod context used to resolve legacy scoped paths for a frame. */
export type FrameScopedPathContext = {
  conversationId: string | null;
  spaceId: string | null;
};

function getScopedPathPrefix(scopedPath: string): string | null {
  const slashIdx = scopedPath.indexOf("/");
  if (slashIdx <= 0) {
    return null;
  }
  return scopedPath.slice(0, slashIdx);
}

/**
 * True for canonical agent-visible paths (`conversation-{id}/...`, `pod-{id}/...`).
 * The id segment after the prefix must be non-empty.
 */
export function isCanonicalScopedPath(scopedPath: string): boolean {
  const prefix = getScopedPathPrefix(scopedPath);
  return prefix ? parseCanonicalScopedPathScope(prefix) !== null : false;
}

/** True for legacy bare-prefix paths (`conversation/...`, `pod/...`, `project/...`). */
export function isLegacyScopedPath(scopedPath: string): boolean {
  const prefix = getScopedPathPrefix(scopedPath);
  if (!prefix) {
    return false;
  }

  return (
    prefix === LEGACY_PREFIX_CONVERSATION ||
    prefix === "pod" ||
    prefix === LEGACY_PREFIX_PROJECT
  );
}

/** True for any agent-visible scoped path (canonical or legacy). */
export function isAgentScopedPath(scopedPath: string): boolean {
  return isCanonicalScopedPath(scopedPath) || isLegacyScopedPath(scopedPath);
}

/**
 * Resolve a legacy scoped path to its canonical form under the frame context.
 * Canonical paths are returned unchanged.
 */
export function resolveCanonicalScopedPath(
  scopedPath: string,
  frameContext: FrameScopedPathContext
): string | null {
  if (isCanonicalScopedPath(scopedPath)) {
    return scopedPath;
  }

  if (!isLegacyScopedPath(scopedPath)) {
    return null;
  }

  const slashIdx = scopedPath.indexOf("/");
  const prefix = scopedPath.slice(0, slashIdx);
  const rel = path.posix.normalize(scopedPath.slice(slashIdx + 1));

  if (rel.startsWith("..") || rel.startsWith("/")) {
    return null;
  }

  switch (prefix) {
    case LEGACY_PREFIX_CONVERSATION: {
      if (!frameContext.conversationId) {
        return null;
      }
      return `${SCOPED_PREFIX_CONVERSATION}${frameContext.conversationId}/${rel}`;
    }
    case "pod":
    case LEGACY_PREFIX_PROJECT: {
      if (!frameContext.spaceId) {
        return null;
      }
      return `${SCOPED_PREFIX_POD}${frameContext.spaceId}/${rel}`;
    }
    default:
      return null;
  }
}

/** Match a requested legacy scoped path against a stored legacy alias. */
export function legacyScopedPathsMatch(
  storedLegacyPath: string | undefined,
  requestedRef: string
): boolean {
  if (!storedLegacyPath) {
    return false;
  }

  if (storedLegacyPath === requestedRef) {
    return true;
  }

  // Older frame code may request `project/...` while the stored alias uses `pod/...`.
  return (
    requestedRef.startsWith(`${LEGACY_PREFIX_PROJECT}/`) &&
    storedLegacyPath ===
      `pod/${requestedRef.slice(`${LEGACY_PREFIX_PROJECT}/`.length)}`
  );
}

export class ResolveScopedMountFilePathError extends Error {
  constructor(
    readonly code: "invalid_prefix" | "outside_scope",
    message: string
  ) {
    super(message);
    this.name = "ResolveScopedMountFilePathError";
  }

  static isResolveScopedMountFilePathError(
    error: unknown
  ): error is ResolveScopedMountFilePathError {
    return error instanceof ResolveScopedMountFilePathError;
  }
}

/**
 * Parse a scoped rel path, normalize it under `mountBasePath`, and reject traversal.
 */
export function resolveScopedMountFilePath({
  relPath,
  expectedPrefix,
  mountBasePath,
  outsideScopeMessage = "Access denied: path is outside mount scope.",
}: {
  relPath: string;
  expectedPrefix: ScopedFilePathPrefix;
  mountBasePath: string;
  outsideScopeMessage?: string;
}): Result<
  { normalizedRelative: string; normalizedGcsPath: string },
  ResolveScopedMountFilePathError
> {
  const scopedPath = parseScopedFilePath(relPath);
  if (!scopedPath || scopedPath.prefix !== expectedPrefix) {
    return new Err(
      new ResolveScopedMountFilePathError(
        "invalid_prefix",
        "Path must start with the correct scope prefix."
      )
    );
  }

  const normalizedGcsPath = path.posix.normalize(
    `${mountBasePath}${scopedPath.rel}`
  );
  if (!normalizedGcsPath.startsWith(mountBasePath)) {
    return new Err(
      new ResolveScopedMountFilePathError("outside_scope", outsideScopeMessage)
    );
  }

  return new Ok({
    normalizedRelative: normalizedGcsPath.slice(mountBasePath.length),
    normalizedGcsPath,
  });
}

export type ResolveMountFilePathError = {
  code: "invalid_path" | "outside_scope";
  message: string;
};

export function isResolveMountFilePathError(
  error: unknown
): error is ResolveMountFilePathError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "invalid_path" || error.code === "outside_scope")
  );
}

/**
 * Validate a full GCS mount file path (as stored on `FileResource.mountFilePath`)
 * and ensure it lies under `mountBasePath`.
 */
export function resolveMountFilePath({
  mountFilePath,
  mountBasePath,
  outsideScopeMessage = "Access denied: path is outside mount scope.",
}: {
  mountFilePath: string;
  mountBasePath: string;
  outsideScopeMessage?: string;
}): Result<{ normalizedMountFilePath: string }, ResolveMountFilePathError> {
  const normalizedMountFilePath = path.posix.normalize(
    mountFilePath.trim().replace(/^\/+/, "")
  );
  if (!normalizedMountFilePath.startsWith(mountBasePath)) {
    return new Err({
      code: "outside_scope",
      message: outsideScopeMessage,
    });
  }

  const mountRelative = normalizedMountFilePath.slice(mountBasePath.length);
  const validated = normalizeAndValidateMountRelativeFilePath(mountRelative);
  if (validated.isErr()) {
    return new Err({
      code: "invalid_path",
      message: validated.error.message,
    });
  }

  return new Ok({ normalizedMountFilePath });
}

/**
 * Resolve a move source path: scoped listing path (`project/foo.pdf`),
 * mount-relative path (`foo.pdf`), or full GCS path (`w/...`).
 */
export function resolveMoveSourcePath({
  sourcePath,
  expectedPrefix,
  mountBasePath,
  outsideScopeMessage = "Access denied: path is outside mount scope.",
}: {
  sourcePath: string;
  expectedPrefix: ScopedFilePathPrefix;
  mountBasePath: string;
  outsideScopeMessage?: string;
}): Result<{ normalizedMountFilePath: string }, ResolveMountFilePathError> {
  const trimmed = sourcePath.trim().replace(/^\/+/, "");

  const scoped = parseScopedFilePath(trimmed);
  if (scoped) {
    if (scoped.prefix !== expectedPrefix) {
      return new Err({
        code: "invalid_path",
        message: "Path must start with the correct scope prefix.",
      });
    }

    const relativeRes = normalizeAndValidateMountRelativeFilePath(scoped.rel);
    if (relativeRes.isErr()) {
      return new Err({
        code: "invalid_path",
        message: relativeRes.error.message,
      });
    }

    const normalizedMountFilePath = path.posix.normalize(
      `${mountBasePath}${relativeRes.value}`
    );
    if (!normalizedMountFilePath.startsWith(mountBasePath)) {
      return new Err({
        code: "outside_scope",
        message: outsideScopeMessage,
      });
    }

    return new Ok({ normalizedMountFilePath });
  }

  if (trimmed.startsWith("w/")) {
    return resolveMountFilePath({
      mountFilePath: trimmed,
      mountBasePath,
      outsideScopeMessage,
    });
  }

  return resolveMountFileSourcePath({
    sourcePath: trimmed,
    mountBasePath,
    outsideScopeMessage,
  });
}

/**
 * Resolve a move source path relative to the mount root (no scope prefix).
 * Returns the normalized mount file path or an error if the path is invalid.
 */
export function resolveMountFileSourcePath({
  sourcePath,
  mountBasePath,
  outsideScopeMessage = "Access denied: path is outside mount scope.",
}: {
  sourcePath: string;
  mountBasePath: string;
  outsideScopeMessage?: string;
}): Result<{ normalizedMountFilePath: string }, ResolveMountFilePathError> {
  const trimmed = sourcePath.trim().replace(/^\/+/, "");

  const relativeRes = normalizeAndValidateMountRelativeFilePath(trimmed);
  if (relativeRes.isErr()) {
    return new Err({
      code: "invalid_path",
      message: relativeRes.error.message,
    });
  }

  const normalizedMountFilePath = path.posix.normalize(
    `${mountBasePath}${relativeRes.value}`
  );
  if (!normalizedMountFilePath.startsWith(mountBasePath)) {
    return new Err({
      code: "outside_scope",
      message: outsideScopeMessage,
    });
  }

  return new Ok({ normalizedMountFilePath });
}

/**
 * Disambiguate a filename by inserting the file's sId before the extension.
 * "report.pdf" + "fil_abc" → "report_fil_abc.pdf"
 * "Makefile" + "fil_abc" → "Makefile_fil_abc"
 */
export function disambiguateFileName(file: FileResource): string {
  const { fileName, sId } = file;

  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) {
    return `${fileName}_${sId}`;
  }

  const basename = fileName.substring(0, lastDot);
  const ext = fileName.substring(lastDot);
  return `${basename}_${sId}${ext}`;
}

/**
 * Split a scoped path to a Frame's entry source file into its bundling root and the entry's path
 * relative to that root, e.g. "conversation-abc/dashboards/Sales.tsx" splits into
 * "conversation-abc/dashboards" and "Sales.tsx". Callers pass the entry's full current path
 * rather than a directory (see `frameEntryRelPath` on `FileUseCaseMetadata` for why).
 */
export function splitFrameEntryScopedPath(
  scopedPath: string
): Result<{ root: string; entryRelPath: string }, Error> {
  const trimmed = scopedPath.replace(/\/+$/, "");
  const root = path.posix.dirname(trimmed);
  if (root === "." || root === "/") {
    return new Err(
      new Error(
        `Path must include the entry file's directory, e.g. 'conversation-<id>/<filename>': got '${scopedPath}'.`
      )
    );
  }

  return new Ok({ root, entryRelPath: path.posix.basename(trimmed) });
}

/**
 * Validate a single folder segment name (no path separators).
 */
export function validateMountFolderName(
  folderName: string
): Result<string, Error> {
  const trimmed = folderName.trim();
  if (
    trimmed === "" ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed === "." ||
    trimmed === ".."
  ) {
    return new Err(
      new Error(
        "folderName is required and must be a non-empty string without path separators."
      )
    );
  }

  return new Ok(trimmed);
}

/**
 * Normalize a parent directory path within a mount (no `project/` prefix).
 * Returns an empty string for the mount root.
 */
export function normalizeMountParentRelativePath(
  parentRelativePath: string | undefined
): Result<string, Error> {
  if (parentRelativePath === undefined || parentRelativePath.trim() === "") {
    return new Ok("");
  }

  const normalized = path.posix.normalize(
    parentRelativePath.replace(/^\/+/, "")
  );
  if (normalized === "." || normalized === "") {
    return new Ok("");
  }

  if (
    normalized.startsWith("..") ||
    normalized.split("/").some((part) => part === "..")
  ) {
    return new Err(new Error("parentRelativePath is outside mount scope."));
  }

  return new Ok(normalized);
}

/**
 * Normalize and validate a file path within a mount (no scope prefix).
 */
export function normalizeAndValidateMountRelativeFilePath(
  relativeFilePath: string
): Result<string, Error> {
  const trimmed = relativeFilePath.trim();
  if (trimmed === "") {
    return new Err(new Error("relativeFilePath is required."));
  }

  const normalized = path.posix.normalize(trimmed.replace(/^\/+/, ""));
  if (normalized === "." || normalized === "") {
    return new Err(new Error("Invalid file path."));
  }

  if (
    normalized.startsWith("..") ||
    normalized.split("/").some((part) => part === "..")
  ) {
    return new Err(new Error("relativeFilePath is outside mount scope."));
  }

  const fileName = normalized.split("/").pop();
  if (!fileName) {
    return new Err(new Error("Invalid file path."));
  }

  return new Ok(normalized);
}

export function joinMountRelativePath(
  parentRelativePath: string,
  folderName: string
): string {
  return parentRelativePath
    ? `${parentRelativePath}/${folderName}`
    : folderName;
}
