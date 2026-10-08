import type { LiveDocument } from "@app/lib/api/collab/ydoc";
import { dfmToYDoc, yDocToDfm } from "@app/lib/api/collab/ydoc";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { readStoredText } from "@app/lib/api/files/dfm_comment_signatures";
import {
  WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES,
  writeCanonicalFileContent,
} from "@app/lib/api/files/file_system_ops";
import type { WorkspaceAccessError } from "@app/lib/api/workspace_validation";
import { validateWorkspaceAccess } from "@app/lib/api/workspace_validation";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { isMarkdownContentType, stripMimeParameters } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/** A file the live session can open, with the caller's access to it. */
export interface LiveFile {
  auth: Authenticator;
  workspaceId: string;
  canonicalPath: string;
  dustFs: DustFileSystem;
  canWrite: boolean;
}

/** Why a file cannot open in a live session. */
export interface LiveFileError {
  code: "invalid_path" | "unavailable" | "not_markdown" | "too_large";
  message: string;
}

/**
 * @cc [owner:PopDaph,label:security] live-file-access
 * A live file MUST open only for a file that exists, whose stored type is Markdown by
 * `isMarkdownContentType` as for the browser's editor, and that `auth` can read through the file
 * system, with the same mount permissions as the file API, and only under its normalized path
 * without a trailing slash, so one file never has two live documents. A file larger than the file API can write MUST be
 * refused before it is read, since the session could never save it. `canWrite` MUST be the file
 * system's write check for that path.
 */
export async function openLiveFile(
  auth: Authenticator,
  canonicalPath: string
): Promise<Result<LiveFile, LiveFileError>> {
  const workspace = auth.workspace();
  if (!workspace) {
    return new Err({ code: "unavailable", message: "No workspace." });
  }
  // A trailing slash survives normalization but names the same file.
  if (
    DustFileSystem.normalizeScopedPath(canonicalPath) !== canonicalPath ||
    canonicalPath.endsWith("/")
  ) {
    return new Err({
      code: "invalid_path",
      message: "Open the file by its normalized path.",
    });
  }

  const dustFs = await DustFileSystem.fromScopedPath(auth, canonicalPath);
  if (dustFs.isErr()) {
    return new Err({ code: "unavailable", message: dustFs.error.message });
  }
  const stat = await dustFs.value.stat(canonicalPath);
  if (stat.isErr()) {
    return new Err({ code: "unavailable", message: stat.error.message });
  }
  if (stat.value === null) {
    return new Err({ code: "unavailable", message: "File not found." });
  }
  // Directories have their own type, so they are refused here too.
  if (!isMarkdownContentType(stripMimeParameters(stat.value.contentType))) {
    return new Err({
      code: "not_markdown",
      message: "Only Markdown files open in a live session.",
    });
  }
  if (stat.value.sizeBytes > WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES) {
    return new Err({
      code: "too_large",
      message: "This file is too large to edit live.",
    });
  }

  return new Ok({
    auth,
    workspaceId: workspace.sId,
    canonicalPath,
    dustFs: dustFs.value,
    canWrite: dustFs.value.checkWriteAccess(canonicalPath).isOk(),
  });
}

/** Why a user may not open or keep a file in a live session. */
export type LiveAccessError =
  | { code: "not_member"; message: string }
  | { code: "not_available"; message: string }
  | { code: "read_only"; message: string }
  | {
      code: "workspace_unavailable";
      message: string;
      workspaceError: WorkspaceAccessError;
    }
  | LiveFileError;

const READ_ONLY: LiveAccessError = {
  code: "read_only",
  message: "Live editing needs write access to this file.",
};

/** Membership, `co_edition` and the workspace's status: a live session's needs besides the file. */
async function checkLiveSessionRights(
  auth: Authenticator
): Promise<Result<void, LiveAccessError>> {
  if (!auth.user() || !auth.isUser()) {
    return new Err({
      code: "not_member",
      message: "Not a member of this workspace.",
    });
  }
  const hasCoEdition = await hasFeatureFlag(auth, "co_edition");
  if (!hasCoEdition) {
    return new Err({
      code: "not_available",
      message: "Live editing is not available here.",
    });
  }
  const workspaceError = validateWorkspaceAccess(auth);
  if (workspaceError) {
    return new Err({
      code: "workspace_unavailable",
      message: `This workspace is not available (${workspaceError.type}).`,
      workspaceError,
    });
  }
  return new Ok(undefined);
}

/**
 * @cc [owner:PopDaph,label:security] live-access
 * A live session MUST be opened only for a member of the workspace, in a workspace with
 * `co_edition` that `validateWorkspaceAccess` lets through, for a file `openLiveFile` opens for
 * them with write access. `auth` MUST be built for this check: an Authenticator keeps the
 * membership, plan and workspace it was built with. Minting a ticket and connecting MUST both go
 * through it.
 */
export async function checkLiveAccess(
  auth: Authenticator,
  canonicalPath: string
): Promise<Result<LiveFile, LiveAccessError>> {
  const rights = await checkLiveSessionRights(auth);
  if (rights.isErr()) {
    return new Err(rights.error);
  }
  const file = await openLiveFile(auth, canonicalPath);
  if (file.isOk() && !file.value.canWrite) {
    // Readers get the file without live editing for now.
    return new Err(READ_ONLY);
  }
  return file;
}

/**
 * @cc [owner:tdraier,label:security] live-read-access
 * Reading a live document's source MUST apply the same membership, `co_edition` and workspace
 * checks as `checkLiveAccess`, for a file `openLiveFile` opens for the user, without requiring write
 * access: a reader may read what the session holds, never change it.
 */
export async function checkLiveReadAccess(
  auth: Authenticator,
  canonicalPath: string
): Promise<Result<LiveFile, LiveAccessError>> {
  const rights = await checkLiveSessionRights(auth);
  if (rights.isErr()) {
    return new Err(rights.error);
  }
  return openLiveFile(auth, canonicalPath);
}

/**
 * @cc [owner:PopDaph,label:security;performance] live-access-recheck
 * Re-checking an open session MUST apply the same membership, `co_edition`, workspace and write
 * access checks as `checkLiveAccess`, with an Authenticator built for it. It MUST NOT read the file
 * from storage: existence, type and size do not decide access, and a re-check runs for every open
 * session.
 */
export async function recheckLiveAccess(
  auth: Authenticator,
  canonicalPath: string
): Promise<Result<void, LiveAccessError>> {
  const rights = await checkLiveSessionRights(auth);
  if (rights.isErr()) {
    return rights;
  }
  // TODO(co-edition step 8): a file deleted or moved during a session keeps it open, failing to
  // save; the per-file lock and the stable file id end those sessions.
  const dustFs = await DustFileSystem.fromScopedPath(auth, canonicalPath);
  if (dustFs.isErr()) {
    return new Err({ code: "unavailable", message: dustFs.error.message });
  }
  if (dustFs.value.checkWriteAccess(canonicalPath).isErr()) {
    return new Err(READ_ONLY);
  }
  return new Ok(undefined);
}

/** The file as the live document last read or wrote it. */
export interface LiveCheckpoint {
  revision: string | undefined;
  content: string;
}

/**
 * @cc [owner:tdraier,label:product;concurrency] live-document-load-checkpoint
 * The checkpoint returned MUST carry the revision of the bytes read, when storage has one, and
 * as content what `yDocToDfm` gives for the loaded document, so a load alone never counts as a
 * change.
 */
export async function loadLiveDocument({
  dustFs,
  canonicalPath,
}: LiveFile): Promise<
  Result<{ live: LiveDocument; checkpoint: LiveCheckpoint }, string>
> {
  const read = await readStoredText(dustFs, canonicalPath);
  if (read.isErr()) {
    return new Err(read.error.message);
  }
  if (read.value === null) {
    return new Err("File not found.");
  }

  const live = dfmToYDoc(read.value.text);
  if (live.isErr()) {
    return live;
  }
  const content = yDocToDfm(live.value);
  if (content.isErr()) {
    return content;
  }
  return new Ok({
    live: live.value,
    checkpoint: { revision: read.value.revision, content: content.value },
  });
}

/**
 * @cc [owner:tdraier,label:product;concurrency] live-document-checkpoint
 * The checkpoint MUST write `yDocToDfm` of the live document, its threads included, only when it
 * differs from `last.content`. With a `last.revision`, the write MUST be conditional on it: a file
 * changed since then MUST be left unchanged and the checkpoint MUST fail. Without one, the file is
 * overwritten, as the editor's own save does on such storage. It MUST return the file as now
 * stored: `last` when nothing was written, otherwise the written content and its revision.
 */
export async function checkpointLiveDocument(
  { auth, dustFs, canonicalPath }: LiveFile,
  live: LiveDocument,
  last: LiveCheckpoint
): Promise<Result<LiveCheckpoint, string>> {
  const content = yDocToDfm(live);
  if (content.isErr()) {
    return content;
  }
  if (content.value === last.content) {
    return new Ok(last);
  }

  // TODO(co-edition): without `last.revision` the write is unconditional, so threads or content
  // written to the file since the load are erased. It also decodes the content back from the
  // buffer and stats the file again, on every checkpoint.
  const written = await writeCanonicalFileContent(
    auth,
    dustFs,
    canonicalPath,
    Buffer.from(content.value, "utf8"),
    undefined,
    last.revision
  );
  if (written.isErr()) {
    return new Err(written.error.message);
  }
  return new Ok({ revision: written.value.revision, content: content.value });
}
