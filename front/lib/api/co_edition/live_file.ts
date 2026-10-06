import type { LiveDocument } from "@app/lib/api/co_edition/ydoc";
import { dfmToYDoc } from "@app/lib/api/co_edition/ydoc";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import {
  readCanonicalFileContent,
  WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES,
} from "@app/lib/api/files/file_system_ops";
import { decodeBuffer } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { streamToBuffer } from "@app/lib/utils/streams";
import { isMarkdownContentType, stripMimeParameters } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const DOCUMENT_NAME_SEPARATOR = ":";

/** A file the live session can open, with the caller's access to it. */
export interface LiveFile {
  workspaceId: string;
  canonicalPath: string;
  dustFs: DustFileSystem;
  canWrite: boolean;
}

// TODO(co-edition step 8): key on a stable file id. A rename during a session leaves editors on
// the old path, and saving there (step 9) would recreate the file.
/** The name a live document goes by on the WebSocket: workspace and file path. */
export function toLiveDocumentName(
  workspaceId: string,
  canonicalPath: string
): string {
  return `${workspaceId}${DOCUMENT_NAME_SEPARATOR}${canonicalPath}`;
}

export function parseLiveDocumentName(
  documentName: string
): { workspaceId: string; canonicalPath: string } | null {
  const index = documentName.indexOf(DOCUMENT_NAME_SEPARATOR);
  if (index <= 0 || index === documentName.length - 1) {
    return null;
  }
  return {
    workspaceId: documentName.slice(0, index),
    canonicalPath: documentName.slice(index + 1),
  };
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
    workspaceId: workspace.sId,
    canonicalPath,
    dustFs: dustFs.value,
    canWrite: dustFs.value.checkWriteAccess(canonicalPath).isOk(),
  });
}

/** Reads the file and converts it the way the editor would load it. */
export async function loadLiveDocument({
  dustFs,
  canonicalPath,
}: LiveFile): Promise<Result<LiveDocument, string>> {
  const read = await readCanonicalFileContent(dustFs, canonicalPath);
  if (read.isErr()) {
    return new Err(read.error.message);
  }
  if (read.value === null) {
    return new Err("File not found.");
  }

  const buffer = await streamToBuffer(read.value.stream);
  if (buffer.isErr()) {
    return buffer;
  }
  return dfmToYDoc(decodeBuffer(buffer.value));
}
