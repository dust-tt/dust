import type { CollabAccess } from "@app/lib/api/collab/access";
import type { SessionContent } from "@app/lib/api/collab/ydoc";
import { dfmToYDoc, yDocToDfm } from "@app/lib/api/collab/ydoc";
import { readStoredText } from "@app/lib/api/documents/comment_signatures";
import { writeCanonicalFileContent } from "@app/lib/api/files/file_system_ops";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/** The file as the session last read or saved it. */
export interface CollabSave {
  revision: string | undefined;
  source: string;
}

/**
 * @cc [owner:tdraier,label:product;concurrency] collab-session-load
 * The save returned MUST carry the revision of the bytes read, when storage has one, and
 * as source what `yDocToDfm` gives for the loaded document, so a load alone never counts as a
 * change.
 */
export async function loadCollabSession({
  dustFs,
  canonicalPath,
}: CollabAccess): Promise<
  Result<{ content: SessionContent; lastSave: CollabSave }, string>
> {
  const read = await readStoredText(dustFs, canonicalPath);
  if (read.isErr()) {
    return new Err(read.error.message);
  }
  if (read.value === null) {
    return new Err("File not found.");
  }

  const content = dfmToYDoc(read.value.text);
  if (content.isErr()) {
    return content;
  }
  const source = yDocToDfm(content.value);
  if (source.isErr()) {
    return source;
  }
  return new Ok({
    content: content.value,
    lastSave: { revision: read.value.revision, source: source.value },
  });
}

/**
 * @cc [owner:tdraier,label:product;concurrency] collab-session-save
 * The save MUST write `yDocToDfm` of the session, its threads included, only when it
 * differs from `last.source`. With a `last.revision`, the write MUST be conditional on it: a file
 * changed since then MUST be left unchanged and the save MUST fail. Without one, the file is
 * overwritten, as the editor's own save does on such storage. It MUST return the file as now
 * stored: `last` when nothing was written, otherwise the written source and its revision.
 */
export async function saveCollabSession(
  { auth, dustFs, canonicalPath }: CollabAccess,
  content: SessionContent,
  last: CollabSave
): Promise<Result<CollabSave, string>> {
  const source = yDocToDfm(content);
  if (source.isErr()) {
    return source;
  }
  if (source.value === last.source) {
    return new Ok(last);
  }

  // TODO(co-edition): without `last.revision` the write is unconditional, so threads or content
  // written to the file since the load are erased. It also decodes the source back from the
  // buffer and stats the file again, on every save.
  const written = await writeCanonicalFileContent(
    auth,
    dustFs,
    canonicalPath,
    Buffer.from(source.value, "utf8"),
    undefined,
    last.revision
  );
  if (written.isErr()) {
    return new Err(written.error.message);
  }
  return new Ok({ revision: written.value.revision, source: source.value });
}
