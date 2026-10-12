import type { LiveSourceError } from "@app/lib/api/collab/live_source";
import {
  fetchLiveSource,
  pushLiveSource,
} from "@app/lib/api/collab/live_source";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { readStoredText } from "@app/lib/api/files/dfm_comment_signatures";
import { writeCanonicalFileContent } from "@app/lib/api/files/file_system_ops";
import type { Authenticator } from "@app/lib/auth";
import type { DfmDocument } from "@app/lib/markdown/dfm";
import { parseDfm, serializeDfm } from "@app/lib/markdown/dfm";
import type { LiveAgent } from "@app/types/collab";
import { contentTypeFromFileName } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const MAX_WRITE_ATTEMPTS = 3;

export type DfmStoredDocumentErrorCode =
  | "not_markdown"
  | "not_found"
  | "invalid_document"
  | "conflict"
  | "refused"
  | "storage_failed";

export class DfmStoredDocumentError extends Error {
  constructor(
    readonly code: DfmStoredDocumentErrorCode,
    message: string
  ) {
    super(message);
  }
}

function fileSystemError(error: {
  code: string;
  message: string;
}): DfmStoredDocumentError {
  return new DfmStoredDocumentError(
    error.code === "internal" ? "storage_failed" : "refused",
    error.message
  );
}

function liveSourceError({
  code,
  message,
}: LiveSourceError): DfmStoredDocumentError {
  return new DfmStoredDocumentError(
    code === "refused" ? "refused" : "storage_failed",
    message
  );
}

function resolveDocumentPath(
  scopedPath: string
): Result<string, DfmStoredDocumentError> {
  const resolvedPath = DustFileSystem.resolveScopedPath(scopedPath);
  if (resolvedPath.isErr()) {
    return new Err(fileSystemError(resolvedPath.error));
  }
  if (contentTypeFromFileName(resolvedPath.value) !== "text/markdown") {
    return new Err(
      new DfmStoredDocumentError(
        "not_markdown",
        "Only Markdown documents can be read or changed with this tool."
      )
    );
  }
  return new Ok(resolvedPath.value);
}

/** That `dustFs` can read the file and that it exists, without reading it. */
async function checkDocumentFound(
  dustFs: DustFileSystem,
  scopedPath: string
): Promise<Result<void, DfmStoredDocumentError>> {
  const found = await dustFs.stat(scopedPath);
  if (found.isErr()) {
    return new Err(fileSystemError(found.error));
  }
  if (found.value === null) {
    return new Err(
      new DfmStoredDocumentError("not_found", `File not found: ${scopedPath}`)
    );
  }
  return new Ok(undefined);
}

function parseDocument(
  text: string
): Result<DfmDocument, DfmStoredDocumentError> {
  const document = parseDfm(text);
  if (document.isErr()) {
    const { message, line } = document.error;
    return new Err(
      new DfmStoredDocumentError(
        "invalid_document",
        line === undefined ? message : `Line ${line}: ${message}`
      )
    );
  }
  return document;
}

/**
 * @cc [owner:tdraier,label:product] dfm-stored-document-read
 * Reading MUST refuse a file whose name does not map to `text/markdown` with `not_markdown`, a
 * missing file with `not_found` and a file the codec cannot parse with `invalid_document`, and
 * MUST otherwise return the stored source unchanged with its parsed document, its revision when
 * storage has one, and its resolved file path.
 */
export async function readStoredDocument(
  dustFs: DustFileSystem,
  scopedPath: string
): Promise<
  Result<
    {
      text: string;
      revision: string | undefined;
      document: DfmDocument;
      filePath: string;
    },
    DfmStoredDocumentError
  >
> {
  const filePath = resolveDocumentPath(scopedPath);
  if (filePath.isErr()) {
    return filePath;
  }

  const read = await readStoredText(dustFs, scopedPath);
  if (read.isErr()) {
    return new Err(fileSystemError(read.error));
  }
  if (read.value === null) {
    return new Err(
      new DfmStoredDocumentError("not_found", `File not found: ${scopedPath}`)
    );
  }
  const { text, revision } = read.value;

  const document = parseDocument(text);
  if (document.isErr()) {
    return document;
  }

  return new Ok({
    text,
    revision,
    document: document.value,
    filePath: filePath.value,
  });
}

type DocumentChange<T, E extends Error> = (read: {
  text: string;
  document: DfmDocument;
  filePath: string;
}) => Promise<Result<{ document: DfmDocument; value: T }, E>>;

async function applyChange<T, E extends Error>(
  change: DocumentChange<T, E>,
  read: { text: string; document: DfmDocument; filePath: string }
): Promise<
  Result<{ serialized: string; value: T }, DfmStoredDocumentError | E>
> {
  const changed = await change(read);
  if (changed.isErr()) {
    return changed;
  }
  const serialized = serializeDfm(changed.value.document);
  if (serialized.isErr()) {
    return new Err(
      new DfmStoredDocumentError("invalid_document", serialized.error.message)
    );
  }
  return new Ok({ serialized: serialized.value, value: changed.value.value });
}

/** The change written through the live session, or `null` when it must start over. */
async function writeLiveDocumentChange<T, E extends Error>(
  auth: Authenticator,
  dustFs: DustFileSystem,
  {
    filePath,
    source,
    agent,
  }: { filePath: string; source: string; agent?: LiveAgent },
  change: DocumentChange<T, E>
): Promise<Result<{ value: T } | null, DfmStoredDocumentError | E>> {
  const found = await checkDocumentFound(dustFs, filePath);
  if (found.isErr()) {
    return found;
  }
  const writable = dustFs.checkWriteAccess(filePath);
  if (writable.isErr()) {
    return new Err(fileSystemError(writable.error));
  }
  const document = parseDocument(source);
  if (document.isErr()) {
    return document;
  }
  const changed = await applyChange(change, {
    text: source,
    document: document.value,
    filePath,
  });
  if (changed.isErr()) {
    return changed;
  }

  const pushed = await pushLiveSource(auth, {
    canonicalPath: filePath,
    base: source,
    source: changed.value.serialized,
    agent,
  });
  if (pushed.isErr()) {
    return new Err(liveSourceError(pushed.error));
  }
  return new Ok(
    pushed.value === "written" ? { value: changed.value.value } : null
  );
}

/**
 * @cc [owner:tdraier,label:product] dfm-stored-document-live-read
 * While a live session holds the document, reading MUST return the session's source in place of
 * the file's, since the file lags the session until its next checkpoint, without reading the file:
 * after the name check of `readStoredDocument`, `dustFs` MUST be able to read the file and the file
 * MUST exist. Otherwise it MUST return what `readStoredDocument` reads, with its refusals. `agent`
 * is passed on to the session, which shows it reading.
 */
export async function readCurrentDocumentSource(
  auth: Authenticator,
  dustFs: DustFileSystem,
  scopedPath: string,
  agent?: LiveAgent
): Promise<Result<{ source: string }, DfmStoredDocumentError>> {
  const filePath = resolveDocumentPath(scopedPath);
  if (filePath.isErr()) {
    return filePath;
  }
  const live = await fetchLiveSource(auth, filePath.value, agent);
  if (live.isErr()) {
    return new Err(liveSourceError(live.error));
  }
  if (live.value.open) {
    const found = await checkDocumentFound(dustFs, filePath.value);
    if (found.isErr()) {
      return found;
    }
    return new Ok({ source: live.value.source });
  }

  const read = await readStoredDocument(dustFs, scopedPath);
  if (read.isErr()) {
    return read;
  }
  return new Ok({ source: read.value.text });
}

/**
 * @cc [owner:tdraier,label:concurrency] dfm-stored-document-write
 * Without a live session, the document MUST be read through `readStoredDocument`, and `change` MUST
 * receive it as read.
 * Its result MUST be written conditional on the revision read; a file whose storage returns no
 * revision MUST be refused. On a conflict it MUST start over from a fresh read, and give up with
 * `conflict` after `MAX_WRITE_ATTEMPTS`, never overwriting a concurrent write.
 *
 * While a live session holds the document, the file MUST NOT be read or written: after the name
 * check of `readStoredDocument`, the file MUST exist and `dustFs` be able to write it, then
 * `change` MUST receive the session's source, parsed, and its result MUST be written through the
 * session, conditional on that source; the session refuses a storage without revisions itself
 * (`collab-live-source-write`), with `agent` passed on so its editors show the agent's edit. A
 * session that changed, closed or was busy meanwhile counts as a conflict.
 *
 * Known gap until the per-file lock of LIVE_SESSION.md (build step 8): a session opening between
 * the check for one and the file write loads the file before the write, so the session misses the
 * write and its checkpoints conflict with it.
 */
export async function writeDocumentChange<T, E extends Error>(
  auth: Authenticator,
  dustFs: DustFileSystem,
  scopedPath: string,
  change: DocumentChange<T, E>,
  agent?: LiveAgent
): Promise<Result<T, DfmStoredDocumentError | E>> {
  const filePath = resolveDocumentPath(scopedPath);
  if (filePath.isErr()) {
    return filePath;
  }

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    // TODO(co-edition): a session opening between this check and the file write below loads the
    // file before the write, and its checkpoints then conflict with it. Both should run under the
    // per-file lock of LIVE_SESSION.md.
    const live = await fetchLiveSource(auth, filePath.value, agent);
    if (live.isErr()) {
      return new Err(liveSourceError(live.error));
    }
    if (live.value.open) {
      const written = await writeLiveDocumentChange(
        auth,
        dustFs,
        { filePath: filePath.value, source: live.value.source, agent },
        change
      );
      if (written.isErr()) {
        return written;
      }
      if (written.value !== null) {
        return new Ok(written.value.value);
      }
      continue;
    }

    const read = await readStoredDocument(dustFs, scopedPath);
    if (read.isErr()) {
      return read;
    }
    const { text, revision, document } = read.value;

    // Without a revision the write cannot be conditional, and could replace a concurrent edit.
    if (revision === undefined) {
      return new Err(
        new DfmStoredDocumentError(
          "refused",
          "This document's storage does not support safe changes yet."
        )
      );
    }

    const changed = await applyChange(change, {
      text,
      document,
      filePath: filePath.value,
    });
    if (changed.isErr()) {
      return changed;
    }

    const written = await writeCanonicalFileContent(
      auth,
      dustFs,
      scopedPath,
      Buffer.from(changed.value.serialized, "utf8"),
      undefined,
      revision
    );
    if (written.isOk()) {
      return new Ok(changed.value.value);
    }
    if (written.error.code !== "revision_conflict") {
      return new Err(fileSystemError(written.error));
    }
  }

  return new Err(
    new DfmStoredDocumentError(
      "conflict",
      "The document kept changing while the change was being applied. Read it again and retry."
    )
  );
}
