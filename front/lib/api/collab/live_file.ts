import type { LiveDocument } from "@app/lib/api/collab/ydoc";
import { dfmToYDoc, yDocToDfm } from "@app/lib/api/collab/ydoc";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { readStoredText } from "@app/lib/api/files/dfm_comment_signatures";
import {
  WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES,
  writeCanonicalFileContent,
} from "@app/lib/api/files/file_system_ops";
import type { Authenticator } from "@app/lib/auth";
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
): Promise<Result<LiveFile, string>> {
  const workspace = auth.workspace();
  if (!workspace) {
    return new Err("No workspace.");
  }
  // A trailing slash survives normalization but names the same file.
  if (
    DustFileSystem.normalizeScopedPath(canonicalPath) !== canonicalPath ||
    canonicalPath.endsWith("/")
  ) {
    return new Err("Open the file by its normalized path.");
  }

  const dustFs = await DustFileSystem.fromScopedPath(auth, canonicalPath);
  if (dustFs.isErr()) {
    return new Err(dustFs.error.message);
  }
  const stat = await dustFs.value.stat(canonicalPath);
  if (stat.isErr()) {
    return new Err(stat.error.message);
  }
  if (stat.value === null) {
    return new Err("File not found.");
  }
  // Directories have their own type, so they are refused here too.
  if (!isMarkdownContentType(stripMimeParameters(stat.value.contentType))) {
    return new Err("Only Markdown files open in a live session.");
  }
  if (stat.value.sizeBytes > WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES) {
    return new Err("This file is too large to edit live.");
  }

  return new Ok({
    auth,
    workspaceId: workspace.sId,
    canonicalPath,
    dustFs: dustFs.value,
    canWrite: dustFs.value.checkWriteAccess(canonicalPath).isOk(),
  });
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
